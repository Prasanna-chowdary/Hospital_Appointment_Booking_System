Prescripto – Appointment Booking System
Prescripto is a full-stack web application designed to streamline the process of booking appointments with trusted doctors. It features dedicated dashboards for both patients and doctors, real-time notifications, and a robust appointment management system.

🚀 Features
For Patients
Search & Filter: Find doctors by specialization (General physician, Gynecologist, Dermatologist, etc.).

Appointment Booking: Select preferred dates and available time slots for visits.

Dashboard: View upcoming appointments, track status (pending, confirmed, completed, cancelled), and manage personal profiles.

Reschedule & Feedback: Options to reschedule appointments and provide ratings/feedback for completed visits.

Notifications: Real-time alerts for appointment updates via a notification bell.

For Doctors
Professional Dashboard: Manage daily schedules, view patient history, and track appointments.

Availability Management: Toggle availability status and manage time slots.

Patient Records: Access a per-patient history to provide better care during consultations.

Waitlist: System to automatically manage and notify patients when a slot opens up.

🛠️ Technology Stack
Frontend: HTML5, CSS3 (using Outfit font), and JavaScript.

Backend: Node.js with Express.js framework.

Database: MongoDB (Mongoose ODM).

Authentication: JSON Web Tokens (JWT) and Password Hashing with BcryptJS.

Security: CORS enabled for cross-origin requests.

⚙️ Setup & Installation
Backend Setup
Navigate to the server directory.

Install required dependencies:

Bash
npm install express cors mongoose bcryptjs jsonwebtoken
Configure your MongoDB URI and JWT Secret in prescripto-server.js (or use environment variables).

Start the server:

Bash
node prescripto-server.js
Frontend Setup
The frontend is contained within index.html.

Ensure the API endpoint in the frontend matches your backend server URL (default: http://localhost:5000).

Open index.html in any modern web browser.

📂 Project Structure
index.html: Contains the entire frontend structure, including styles for the UI and the application logic.

prescripto-server.js: The Express backend handling API routes for patients, doctors, appointments, and notifications.

🏥 Specialties Supported
General physician

Gynecologist

Dermatologist

Pediatricians

Neurologist

Gastroenterologist
