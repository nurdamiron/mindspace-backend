const pool = require('./pool');

async function initSchema() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Users table (unified for all roles)
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL CHECK (role IN ('student', 'psychologist', 'admin')),
        name VARCHAR(255),
        faculty VARCHAR(255),
        course INTEGER,
        gender VARCHAR(20),
        age INTEGER,
        specialization VARCHAR(255),
        languages VARCHAR(255),
        avatar VARCHAR(500),
        experience_years INTEGER,
        bio TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Time slots for psychologists
    await client.query(`
      CREATE TABLE IF NOT EXISTS time_slots (
        id SERIAL PRIMARY KEY,
        psychologist_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        is_available BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Appointments
    await client.query(`
      CREATE TABLE IF NOT EXISTS appointments (
        id SERIAL PRIMARY KEY,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        psychologist_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        slot_id INTEGER REFERENCES time_slots(id) ON DELETE SET NULL,
        status VARCHAR(30) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show')),
        reason TEXT,
        format VARCHAR(20) DEFAULT 'offline' CHECK (format IN ('online', 'offline')),
        feedback_score INTEGER,
        feedback_text TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Daily check-ins (mood, stress, sleep, energy, productivity)
    await client.query(`
      CREATE TABLE IF NOT EXISTS check_ins (
        id SERIAL PRIMARY KEY,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        mood INTEGER CHECK (mood BETWEEN 1 AND 5),
        stress INTEGER CHECK (stress BETWEEN 1 AND 5),
        sleep INTEGER CHECK (sleep BETWEEN 1 AND 5),
        energy INTEGER CHECK (energy BETWEEN 1 AND 5),
        productivity INTEGER CHECK (productivity BETWEEN 1 AND 5),
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Session notes by psychologists
    await client.query(`
      CREATE TABLE IF NOT EXISTS session_notes (
        id SERIAL PRIMARY KEY,
        appointment_id INTEGER REFERENCES appointments(id) ON DELETE CASCADE,
        psychologist_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        condition_before INTEGER CHECK (condition_before BETWEEN 1 AND 10),
        condition_after INTEGER CHECK (condition_after BETWEEN 1 AND 10),
        recommend_followup BOOLEAN DEFAULT false,
        tags VARCHAR(500),
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Screening surveys
    await client.query(`
      CREATE TABLE IF NOT EXISTS surveys (
        id SERIAL PRIMARY KEY,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        answers JSONB NOT NULL,
        score INTEGER,
        risk_level VARCHAR(20),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // AI chat messages
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query('COMMIT');
    console.log('✅ Database schema initialized successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error initializing schema:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Run if executed directly
if (require.main === module) {
  initSchema()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = initSchema;
