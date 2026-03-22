// pool — PostgreSQL байланыс пулы
const pool = require('./pool');
// bcryptjs — құпия сөздерді хэштеу үшін
const bcrypt = require('bcryptjs');

// seed — дерекқорды тестілік деректермен толтырады
async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Барлық кестелерді тазалау (тәуелділік ретімен)
    await client.query('DELETE FROM chat_messages');
    await client.query('DELETE FROM surveys');
    await client.query('DELETE FROM session_notes');
    await client.query('DELETE FROM appointments');
    await client.query('DELETE FROM check_ins');
    await client.query('DELETE FROM time_slots');
    await client.query('DELETE FROM users');

    // Барлық демо пайдаланушылар үшін бірыңғай хэш
    const hash = await bcrypt.hash('password123', 10);

    // Демо пайдаланушыларды жасау: 3 студент, 2 психолог, 1 әкімші
    const usersResult = await client.query(`
      INSERT INTO users (email, password_hash, role, name, faculty, course, gender, age, specialization, languages, experience_years, bio)
      VALUES
        ('student1@university.kz', $1, 'student', 'Студент А', 'Информационные технологии', 2, 'male', 20, NULL, NULL, NULL, NULL),
        ('student2@university.kz', $1, 'student', 'Студент Б', 'Бизнес и управление', 3, 'female', 21, NULL, NULL, NULL, NULL),
        ('student3@university.kz', $1, 'student', 'Студент В', 'Инженерия', 1, 'male', 18, NULL, NULL, NULL, NULL),
        ('psych1@university.kz', $1, 'psychologist', 'Д-р Айгерим Касымова', NULL, NULL, 'female', 35, 'Стресс и тревожность', 'Казахский, Русский, Английский', 8, 'Специализируюсь на работе со студентами, помогаю справляться со стрессом и академическим выгоранием.'),
        ('psych2@university.kz', $1, 'psychologist', 'Д-р Марат Сулейменов', NULL, NULL, 'male', 42, 'Депрессия и эмоциональная регуляция', 'Казахский, Русский', 14, 'Опыт работы с молодёжью, индивидуальные и групповые консультации.'),
        ('admin@university.kz', $1, 'admin', 'Администратор', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
      RETURNING id, role, email
    `, [hash]);

    // Пайдаланушы ID-лерін email бойынша сәйкестендіру
    const users = {};
    usersResult.rows.forEach(u => {
      if (u.email === 'student1@university.kz') users.student1 = u.id;
      if (u.email === 'student2@university.kz') users.student2 = u.id;
      if (u.email === 'student3@university.kz') users.student3 = u.id;
      if (u.email === 'psych1@university.kz') users.psych1 = u.id;
      if (u.email === 'psych2@university.kz') users.psych2 = u.id;
    });

    // Келесі 14 жұмыс күніне уақыт слоттарын жасау (демалыс күндері өткізіледі)
    const slotIds = [];
    for (let day = 0; day < 14; day++) {
      const date = new Date();
      date.setDate(date.getDate() + day);
      if (date.getDay() === 0 || date.getDay() === 6) continue;

      const dateStr = date.toISOString().split('T')[0];
      const times = [
        ['09:00', '10:00'], ['10:00', '11:00'], ['11:00', '12:00'],
        ['14:00', '15:00'], ['15:00', '16:00'], ['16:00', '17:00'],
      ];

      // Екі психолог үшін де слоттар жасау
      for (const psychId of [users.psych1, users.psych2]) {
        for (const [start, end] of times) {
          const result = await client.query(
            `INSERT INTO time_slots (psychologist_id, date, start_time, end_time, is_available)
             VALUES ($1, $2, $3, $4, true) RETURNING id`,
            [psychId, dateStr, start, end]
          );
          slotIds.push(result.rows[0].id);
        }
      }
    }

    // Демо сеанстарды жасау — бірнеше слотты бос емес деп белгілеу
    if (slotIds.length >= 4) {
      await client.query('UPDATE time_slots SET is_available = false WHERE id IN ($1, $2, $3, $4)',
        [slotIds[0], slotIds[1], slotIds[6], slotIds[7]]);

      await client.query(`
        INSERT INTO appointments (student_id, psychologist_id, slot_id, status, reason, format)
        VALUES
          ($1, $4, $6, 'completed', 'Стресс из-за экзаменов', 'offline'),
          ($1, $4, $7, 'scheduled', 'Продолжение консультации', 'offline'),
          ($2, $5, $8, 'completed', 'Проблемы со сном', 'online'),
          ($3, $5, $9, 'scheduled', 'Тревожность', 'offline')
      `, [users.student1, users.student2, users.student3, users.psych1, users.psych2,
          slotIds[0], slotIds[1], slotIds[6], slotIds[7]]);

      // Аяқталған сеанстарға жазбалар қосу
      const appts = await client.query(
        'SELECT id, psychologist_id FROM appointments WHERE status = $1', ['completed']
      );
      for (const appt of appts.rows) {
        await client.query(`
          INSERT INTO session_notes (appointment_id, psychologist_id, condition_before, condition_after, recommend_followup, tags, notes)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [appt.id, appt.psychologist_id, 4, 7, true, 'стресс,экзамены',
            'Студент испытывает значительный стресс перед экзаменами. Рекомендована дыхательная терапия.']);
      }
    }

    // 4 аптаға ретроспективті check-in деректерін жасау (20% күн кездейсоқ өткізіледі)
    for (const studentId of [users.student1, users.student2, users.student3]) {
      for (let day = 28; day >= 0; day--) {
        const date = new Date();
        date.setDate(date.getDate() - day);
        if (Math.random() < 0.2) continue;

        const dateStr = date.toISOString().split('T')[0];
        // Барлық көрсеткіштер 2–4 аралығында (орташа диапазон)
        const mood         = Math.floor(Math.random() * 3) + 2;
        const stress       = Math.floor(Math.random() * 3) + 2;
        const sleep        = Math.floor(Math.random() * 3) + 2;
        const energy       = Math.floor(Math.random() * 3) + 2;
        const productivity = Math.floor(Math.random() * 3) + 2;

        await client.query(
          `INSERT INTO check_ins (student_id, date, mood, stress, sleep, energy, productivity)
           VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
          [studentId, dateStr, mood, stress, sleep, energy, productivity]
        );
      }
    }

    // Демо скрининг сауалнамалары
    await client.query(`
      INSERT INTO surveys (student_id, type, answers, score, risk_level)
      VALUES
        ($1, 'screening', '{"q1": 3, "q2": 4, "q3": 2, "q4": 3, "q5": 4}', 16, 'moderate'),
        ($2, 'screening', '{"q1": 2, "q2": 2, "q3": 3, "q4": 2, "q5": 2}', 11, 'low')
    `, [users.student1, users.student2]);

    await client.query('COMMIT');
    console.log('Дерекқор сәтті толтырылды');
    console.log('Демо аккаунттар:');
    console.log('  Студент:    student1@university.kz / password123');
    console.log('  Психолог:   psych1@university.kz / password123');
    console.log('  Әкімші:     admin@university.kz / password123');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Дерекқорды толтыруда қате:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().then(() => process.exit(0)).catch(() => process.exit(1));
