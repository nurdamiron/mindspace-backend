# MindSpace — Backend API

University mental health support platform backend.

## Tech Stack
- **Node.js** + **Express.js**
- **PostgreSQL** (via `pg`)
- **JWT** authentication

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create `.env` file:
   ```env
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=mental_health_platform
   DB_USER=postgres
   DB_PASSWORD=postgres
   JWT_SECRET=your-secret-key
   PORT=3001
   ```

3. Create the PostgreSQL database:
   ```bash
   createdb mental_health_platform
   ```

4. Initialize schema:
   ```bash
   node db/schema.js
   ```

5. Seed with demo data:
   ```bash
   node db/seed.js
   ```

6. Start server:
   ```bash
   npm run dev
   ```

## Demo Accounts
| Role | Email | Password |
|------|-------|----------|
| Student | student1@university.kz | password123 |
| Psychologist | psych1@university.kz | password123 |
| Admin | admin@university.kz | password123 |

## API Endpoints

| Method | Path | Role | Description |
|--------|------|------|-------------|
| POST | `/api/auth/login` | All | Login |
| GET | `/api/auth/me` | All | Current user |
| GET | `/api/student/stats` | Student | Personal stats |
| POST | `/api/student/check-ins` | Student | Daily check-in |
| GET | `/api/student/psychologists` | Student | Psychologist catalog |
| POST | `/api/student/appointments` | Student | Book appointment |
| POST | `/api/student/chat` | Student | AI chat message |
| GET | `/api/psychologist/schedule` | Psychologist | Today's schedule |
| GET | `/api/psychologist/students/:id` | Psychologist | Student card |
| POST | `/api/psychologist/sessions/:id/notes` | Psychologist | Add session notes |
| GET | `/api/admin/dashboard` | Admin | Aggregate stats |
| POST | `/api/admin/psychologists` | Admin | Add psychologist |
| POST | `/api/admin/slots` | Admin | Create time slots |
