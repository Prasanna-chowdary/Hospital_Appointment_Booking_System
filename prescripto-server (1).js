/**
 * Prescripto – Backend Server (updated for v3 frontend)
 *
 * SETUP (one time):
 *   npm install express cors mongoose bcryptjs jsonwebtoken
 *
 * RUN:
 *   node prescripto-server.js
 *
 * NEW in v3:
 *  - Notifications (bell icon in patient nav)
 *  - Patient password change
 *  - Doctor patient list + per-patient history
 *  - Appointment rating & feedback
 *  - Appointment reschedule
 *  - Waitlist
 *  - Doctor login now accepts docId (for dropdown) OR email+password
 *  - Contact stores subject
 */

const express  = require('express');
const cors     = require('cors');
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');

const app  = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'prescripto_secret_key';
const MONGO_URI  = process.env.MONGO_URI ||
  "mongodb://sirishapadal09_db_user:padala12345@ac-b4pxnnd-shard-00-00.nairt6a.mongodb.net:27017,ac-b4pxnnd-shard-00-01.nairt6a.mongodb.net:27017,ac-b4pxnnd-shard-00-02.nairt6a.mongodb.net:27017/prescripto?ssl=true&replicaSet=atlas-lhe90p-shard-0&authSource=admin";

app.use(cors({ origin: '*' }));
app.use(express.json());

// ─── MongoDB ───────────────────────────────────────────────────
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

// ══════════════════════════════════════════════════════════════
//  MODELS
// ══════════════════════════════════════════════════════════════

// ── Patient ──────────────────────────────────────────────────
const PatientSchema = new mongoose.Schema({
  name:     String,
  email:    { type: String, unique: true },
  password: { type: String, select: false },
  phone:    String,
  gender:   { type: String, default: '' },
  dob:      { type: String, default: '' },
  address:  { type: String, default: '' }
}, { timestamps: true });

PatientSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});
const Patient = mongoose.model('Patient', PatientSchema);

// ── Doctor ────────────────────────────────────────────────────
const DoctorSchema = new mongoose.Schema({
  name:           String,
  email:          { type: String, unique: true },
  password:       { type: String, select: false },
  specialization: String,
  experience:     { type: String, default: '' },
  fee:            { type: String, default: '' },
  phone:          { type: String, default: '' },
  about:          { type: String, default: '' },
  address:        { type: String, default: '' },
  initials:       String,
  color:          { type: String, default: '#4361ee' },
  isAvailable:    { type: Boolean, default: true }
}, { timestamps: true });

DoctorSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});
const Doctor = mongoose.model('Doctor', DoctorSchema);

// ── Appointment ───────────────────────────────────────────────
const AppointmentSchema = new mongoose.Schema({
  patient:      { type: mongoose.Schema.Types.ObjectId, ref: 'Patient' },
  doctor:       { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
  patName:      String,
  patPhone:     String,
  patEmail:     String,
  docName:      String,
  docSpec:      String,
  date:         String,         // YYYY-MM-DD
  time:         String,         // e.g. "9:00 AM"
  reason:       String,
  status:       { type: String, default: 'pending', enum: ['pending','confirmed','completed','cancelled'] },
  notes:        { type: String, default: '' },
  prescription: { type: String, default: '' },
  // ── NEW v3 fields ──
  rating:       { type: Number, default: 0, min: 0, max: 5 },
  feedback:     { type: String, default: '' }
}, { timestamps: true });
const Appointment = mongoose.model('Appointment', AppointmentSchema);

// ── Notification (NEW v3) ─────────────────────────────────────
const NotificationSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient' },
  message: String,
  read:    { type: Boolean, default: false }
}, { timestamps: true });
const Notification = mongoose.model('Notification', NotificationSchema);

// ── Waitlist (NEW v3) ─────────────────────────────────────────
const WaitlistSchema = new mongoose.Schema({
  doctor:    { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
  date:      String,
  name:      String,
  contact:   String,
  notified:  { type: Boolean, default: false }
}, { timestamps: true });
const Waitlist = mongoose.model('Waitlist', WaitlistSchema);

// ── Contact message ───────────────────────────────────────────
const ContactSchema = new mongoose.Schema({
  name: String, email: String, subject: { type: String, default: '' }, message: String
}, { timestamps: true });
const Contact = mongoose.model('Contact', ContactSchema);

// ══════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════

const signToken = (id, role) => jwt.sign({ id, role }, JWT_SECRET, { expiresIn: '7d' });

/** Middleware factory — pass a role string or null for any-auth */
const protect = (role) => async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer '))
    return res.status(401).json({ success: false, message: 'Not authorised.' });
  try {
    const decoded = jwt.verify(auth.split(' ')[1], JWT_SECRET);
    if (role && decoded.role !== role)
      return res.status(403).json({ success: false, message: 'Access denied.' });
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Token invalid or expired.' });
  }
};

/** Push a notification to a patient (fire-and-forget helper) */
async function notify(patientId, message) {
  try { await Notification.create({ patient: patientId, message }); } catch (_) {}
}

// ══════════════════════════════════════════════════════════════
//  PATIENT ROUTES
// ══════════════════════════════════════════════════════════════

// Register
app.post('/api/patients/signup', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    if (!name || !email || !phone || !password)
      return res.status(400).json({ success: false, message: 'All fields required.' });
    if (password.length < 6)
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    const exists = await Patient.findOne({ email });
    if (exists)
      return res.status(409).json({ success: false, message: 'Email already registered. Please login.' });
    const patient = await Patient.create({ name, email, phone, password });
    const token = signToken(patient._id, 'patient');
    res.status(201).json({ success: true, message: `Welcome, ${name.split(' ')[0]}!`, token,
      user: { id: patient._id, name, email, role: 'patient' } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Login
app.post('/api/patients/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const patient = await Patient.findOne({ email }).select('+password');
    if (!patient || !(await bcrypt.compare(password, patient.password)))
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    const token = signToken(patient._id, 'patient');
    res.json({ success: true, message: `Welcome back, ${patient.name.split(' ')[0]}!`, token,
      user: { id: patient._id, name: patient.name, email, role: 'patient' } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Get profile
app.get('/api/patients/me', protect('patient'), async (req, res) => {
  try {
    const p = await Patient.findById(req.user.id);
    res.json({ success: true, patient: p });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Update profile
app.put('/api/patients/me', protect('patient'), async (req, res) => {
  try {
    const allowed = ['name','phone','gender','dob','address'];
    const update  = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
    const p = await Patient.findByIdAndUpdate(req.user.id, update, { new: true });
    res.json({ success: true, message: 'Profile updated.', patient: p });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── NEW v3: Change password ───────────────────────────────────
app.put('/api/patients/me/password', protect('patient'), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({ success: false, message: 'Both fields required.' });
    if (newPassword.length < 6)
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters.' });
    const patient = await Patient.findById(req.user.id).select('+password');
    if (!(await bcrypt.compare(currentPassword, patient.password)))
      return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    patient.password = newPassword;   // pre-save hook hashes it
    await patient.save();
    res.json({ success: true, message: 'Password changed successfully! 🔒' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ══════════════════════════════════════════════════════════════
//  DOCTOR ROUTES
// ══════════════════════════════════════════════════════════════

// ── NEW v3: Login now also accepts docId (dropdown selection) ─
// Frontend sends { docId?, email, password }
// If docId is provided, find doctor by _id; otherwise by email.
app.post('/api/doctors/login', async (req, res) => {
  try {
    const { docId, email, password } = req.body;
    if (!password)
      return res.status(400).json({ success: false, message: 'Password required.' });

    let doctor;
    if (docId) {
      doctor = await Doctor.findById(docId).select('+password');
    } else {
      if (!email)
        return res.status(400).json({ success: false, message: 'Email or doctor selection required.' });
      doctor = await Doctor.findOne({ email }).select('+password');
    }

    if (!doctor || !(await bcrypt.compare(password, doctor.password)))
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });

    const token = signToken(doctor._id, 'doctor');
    res.json({ success: true, message: `Welcome, Dr. ${doctor.name.split(' ').pop()}!`, token,
      user: { id: doctor._id, name: doctor.name, email: doctor.email,
              specialization: doctor.specialization, initials: doctor.initials,
              color: doctor.color, role: 'doctor' } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// List all doctors (public) — supports ?spec= and ?search=
app.get('/api/doctors', async (req, res) => {
  try {
    const filter = { isAvailable: true };
    if (req.query.spec)   filter.specialization = req.query.spec;
    if (req.query.search) filter.name = { $regex: req.query.search, $options: 'i' };
    const doctors = await Doctor.find(filter);
    res.json({ success: true, count: doctors.length, doctors });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Single doctor (public)
app.get('/api/doctors/:id', async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found.' });
    res.json({ success: true, doctor });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Doctor profile update (self)
app.put('/api/doctors/me/profile', protect('doctor'), async (req, res) => {
  try {
    const allowed = ['specialization','experience','fee','phone','about','address'];
    const update  = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
    const d = await Doctor.findByIdAndUpdate(req.user.id, update, { new: true });
    res.json({ success: true, message: 'Profile saved.', doctor: d });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ══════════════════════════════════════════════════════════════
//  APPOINTMENT ROUTES
// ══════════════════════════════════════════════════════════════

// Check booked slots (public)
app.get('/api/appointments/slots', async (req, res) => {
  try {
    const { doctorId, date } = req.query;
    if (!doctorId || !date)
      return res.status(400).json({ success: false, message: 'doctorId and date required.' });
    const booked = await Appointment.find({ doctor: doctorId, date, status: { $ne: 'cancelled' } }).select('time');
    res.json({ success: true, bookedSlots: booked.map(a => a.time) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Book appointment (patient)
app.post('/api/appointments', protect('patient'), async (req, res) => {
  try {
    const { doctorId, date, time, reason, patPhone, patEmail, patName } = req.body;
    if (!doctorId || !date || !time || !reason || !patPhone)
      return res.status(400).json({ success: false, message: 'All fields required.' });
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found.' });
    const conflict = await Appointment.findOne({ doctor: doctorId, date, time, status: { $ne: 'cancelled' } });
    if (conflict) return res.status(409).json({ success: false, message: 'Slot already booked. Please choose another.' });
    const appt = await Appointment.create({
      patient: req.user.id, doctor: doctorId,
      patName: patName || '', patPhone, patEmail: patEmail || '',
      docName: doctor.name, docSpec: doctor.specialization,
      date, time, reason
    });
    // Notify patient
    await notify(req.user.id, `Appointment booked with ${doctor.name} on ${date} at ${time}.`);
    res.status(201).json({ success: true,
      message: `Appointment booked with ${doctor.name} on ${date} at ${time}!`,
      appointment: appt });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Patient: own appointments
app.get('/api/appointments/my', protect('patient'), async (req, res) => {
  try {
    const filter = { patient: req.user.id };
    if (req.query.status) filter.status = req.query.status;
    const appts = await Appointment.find(filter)
      .populate('doctor', 'name specialization color initials fee')
      .sort({ date: -1 });
    res.json({ success: true, count: appts.length, appointments: appts });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Patient: single appointment detail
app.get('/api/appointments/my/:id', protect('patient'), async (req, res) => {
  try {
    const appt = await Appointment.findOne({ _id: req.params.id, patient: req.user.id })
      .populate('doctor', 'name specialization color initials fee about');
    if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found.' });
    res.json({ success: true, appointment: appt });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Patient: cancel
app.patch('/api/appointments/my/:id/cancel', protect('patient'), async (req, res) => {
  try {
    const appt = await Appointment.findOne({ _id: req.params.id, patient: req.user.id });
    if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found.' });
    if (!['pending','confirmed'].includes(appt.status))
      return res.status(400).json({ success: false, message: `Cannot cancel a ${appt.status} appointment.` });
    appt.status = 'cancelled';
    await appt.save();
    await notify(req.user.id, `Appointment with ${appt.docName} on ${appt.date} at ${appt.time} has been cancelled.`);
    res.json({ success: true, message: 'Appointment cancelled.', appointment: appt });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── NEW v3: Patient reschedule ────────────────────────────────
app.patch('/api/appointments/my/:id/reschedule', protect('patient'), async (req, res) => {
  try {
    const { date, time } = req.body;
    if (!date || !time)
      return res.status(400).json({ success: false, message: 'New date and time required.' });
    const appt = await Appointment.findOne({ _id: req.params.id, patient: req.user.id });
    if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found.' });
    if (!['pending','confirmed'].includes(appt.status))
      return res.status(400).json({ success: false, message: 'Only pending or confirmed appointments can be rescheduled.' });
    // Check slot availability (excluding this appointment)
    const conflict = await Appointment.findOne({
      _id: { $ne: appt._id }, doctor: appt.doctor, date, time, status: { $ne: 'cancelled' }
    });
    if (conflict)
      return res.status(409).json({ success: false, message: 'That slot is already taken. Please choose another.' });
    const oldDate = appt.date, oldTime = appt.time;
    appt.date   = date;
    appt.time   = time;
    appt.status = 'pending';   // reset to pending on reschedule
    await appt.save();
    await notify(req.user.id,
      `Rescheduled: ${appt.docName} from ${oldDate} ${oldTime} → ${date} ${time}.`);
    res.json({ success: true, message: `Rescheduled to ${date} at ${time}.`, appointment: appt });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── NEW v3: Patient rate a completed appointment ──────────────
app.patch('/api/appointments/my/:id/rate', protect('patient'), async (req, res) => {
  try {
    const { rating, feedback } = req.body;
    if (!rating || rating < 1 || rating > 5)
      return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5.' });
    const appt = await Appointment.findOne({ _id: req.params.id, patient: req.user.id });
    if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found.' });
    if (appt.status !== 'completed')
      return res.status(400).json({ success: false, message: 'Can only rate completed appointments.' });
    appt.rating   = Number(rating);
    appt.feedback = feedback || '';
    await appt.save();
    res.json({ success: true, message: 'Thank you for your feedback! ⭐', appointment: appt });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Doctor: all their appointments (supports ?date= and ?status=)
app.get('/api/appointments/doctor', protect('doctor'), async (req, res) => {
  try {
    const filter = { doctor: req.user.id };
    if (req.query.date)   filter.date   = req.query.date;
    if (req.query.status) filter.status = req.query.status;
    const appts = await Appointment.find(filter)
      .populate('patient', 'name email phone')
      .sort({ date: 1, time: 1 });
    res.json({ success: true, count: appts.length, appointments: appts });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Doctor: dashboard stats
app.get('/api/appointments/doctor/stats', protect('doctor'), async (req, res) => {
  try {
    const docId = req.user.id;
    const today = new Date().toISOString().split('T')[0];
    const [total, todayCount, pending, confirmed, completed, cancelled, uniquePatients] = await Promise.all([
      Appointment.countDocuments({ doctor: docId }),
      Appointment.countDocuments({ doctor: docId, date: today }),
      Appointment.countDocuments({ doctor: docId, status: 'pending' }),
      Appointment.countDocuments({ doctor: docId, status: 'confirmed' }),
      Appointment.countDocuments({ doctor: docId, status: 'completed' }),
      Appointment.countDocuments({ doctor: docId, status: 'cancelled' }),
      Appointment.distinct('patient', { doctor: docId })
    ]);
    res.json({ success: true,
      stats: { total, today: todayCount, pending, confirmed, completed, cancelled,
                uniquePatients: uniquePatients.length } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Doctor: update appointment status
app.patch('/api/appointments/doctor/:id/status', protect('doctor'), async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['pending','confirmed','completed','cancelled'];
    if (!valid.includes(status))
      return res.status(400).json({ success: false, message: 'Invalid status value.' });
    const appt = await Appointment.findOne({ _id: req.params.id, doctor: req.user.id });
    if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found.' });
    appt.status = status;
    await appt.save();
    // Notify patient of status change
    await notify(appt.patient,
      `Your appointment with ${appt.docName} on ${appt.date} at ${appt.time} has been ${status}.`);
    res.json({ success: true, message: `Marked as ${status}.`, appointment: appt });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Doctor: save notes & prescription
app.put('/api/appointments/doctor/:id/notes', protect('doctor'), async (req, res) => {
  try {
    const appt = await Appointment.findOne({ _id: req.params.id, doctor: req.user.id });
    if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found.' });
    appt.notes        = req.body.notes        ?? appt.notes;
    appt.prescription = req.body.prescription ?? appt.prescription;
    await appt.save();
    res.json({ success: true, message: 'Notes & prescription saved. 💊', appointment: appt });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── NEW v3: Doctor — unique patient list ──────────────────────
app.get('/api/appointments/doctor/patients', protect('doctor'), async (req, res) => {
  try {
    const appts = await Appointment.find({ doctor: req.user.id })
      .populate('patient', 'name email phone')
      .sort({ date: -1 });

    // Group by patient id
    const map = {};
    for (const a of appts) {
      if (!a.patient) continue;
      const pid = a.patient._id.toString();
      if (!map[pid]) {
        map[pid] = { patient: a.patient, totalVisits: 0, lastVisit: a.date };
      }
      map[pid].totalVisits++;
      if (a.date > map[pid].lastVisit) map[pid].lastVisit = a.date;
    }
    res.json({ success: true, patients: Object.values(map) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── NEW v3: Doctor — one patient's visit history ──────────────
app.get('/api/appointments/doctor/patients/:patId/history', protect('doctor'), async (req, res) => {
  try {
    const history = await Appointment.find({
      doctor:  req.user.id,
      patient: req.params.patId
    }).sort({ date: -1 });
    res.json({ success: true, count: history.length, history });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ══════════════════════════════════════════════════════════════
//  NOTIFICATION ROUTES (NEW v3)
// ══════════════════════════════════════════════════════════════

// Get notifications (last 50, newest first)
app.get('/api/notifications', protect('patient'), async (req, res) => {
  try {
    const notifs = await Notification.find({ patient: req.user.id })
      .sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, notifications: notifs });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Mark all as read
app.patch('/api/notifications/read-all', protect('patient'), async (req, res) => {
  try {
    await Notification.updateMany({ patient: req.user.id, read: false }, { read: true });
    res.json({ success: true, message: 'All notifications marked as read.' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Mark one as read
app.patch('/api/notifications/:id/read', protect('patient'), async (req, res) => {
  try {
    await Notification.findOneAndUpdate({ _id: req.params.id, patient: req.user.id }, { read: true });
    res.json({ success: true, message: 'Notification marked as read.' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ══════════════════════════════════════════════════════════════
//  WAITLIST ROUTES (NEW v3)
// ══════════════════════════════════════════════════════════════

// Join waitlist
app.post('/api/waitlist', protect('patient'), async (req, res) => {
  try {
    const { doctorId, date, name, contact } = req.body;
    if (!doctorId || !date || !name || !contact)
      return res.status(400).json({ success: false, message: 'All fields required.' });
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found.' });
    const entry = await Waitlist.create({ doctor: doctorId, date, name, contact });
    await notify(req.user.id,
      `Added to waitlist for ${doctor.name} on ${date}.`);
    res.status(201).json({ success: true,
      message: "You're on the waitlist! We'll notify you when a slot opens. 🔔",
      entry });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ══════════════════════════════════════════════════════════════
//  CONTACT
// ══════════════════════════════════════════════════════════════

app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;
    if (!name || !email || !message)
      return res.status(400).json({ success: false, message: 'Name, email and message are required.' });
    await Contact.create({ name, email, subject: subject || '', message });
    console.log(`📬 Contact from ${name} <${email}>: ${subject}`);
    res.json({ success: true, message: "Message received! We'll get back to you soon." });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ══════════════════════════════════════════════════════════════
//  HEALTH CHECK
// ══════════════════════════════════════════════════════════════

app.get('/api/health', (_req, res) =>
  res.json({ success: true, message: '🚀 Prescripto API v3 running!' }));

// ══════════════════════════════════════════════════════════════
//  START
// ══════════════════════════════════════════════════════════════

app.listen(PORT, () => {
  console.log(`\n🚀 Server running at http://localhost:${PORT}`);
  console.log(`📋 Health: http://localhost:${PORT}/api/health`);
  console.log(`\n⚡ npm install express cors mongoose bcryptjs jsonwebtoken\n`);
});