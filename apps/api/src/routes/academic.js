import { Router } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { Queue } from 'bullmq';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { redis } from '../config/redis.js';
import { withCache, invalidateCache } from '../utils/cache.js';
import { AcademicYear } from '../models/AcademicYear.js';
import { Term } from '../models/Term.js';
import { Class } from '../models/Class.js';
import { Section } from '../models/Section.js';
import { Subject } from '../models/Subject.js';
import { Student } from '../models/Student.js';
import { Timetable } from '../models/Timetable.js';
import { AttendanceRecord } from '../models/AttendanceRecord.js';
import { Grade } from '../models/Grade.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });
const reportCardQueue = new Queue('report-card', { connection: redis });

router.use(authenticate);

// ── Academic Years ────────────────────────────────────────────────────────────

router.post('/years', requirePermission('tenant:admin'), async (req, res, next) => {
  try {
    const { name, startDate, endDate } = req.body;
    const tenantId = req.tenant._id;

    await AcademicYear.updateMany({ tenantId }, { $set: { isActive: false } });

    const year = await AcademicYear.create({ tenantId, name, startDate, endDate, isActive: true });
    await invalidateCache(`years:${tenantId}`);
    res.status(201).json(year);
  } catch (err) {
    next(err);
  }
});

router.get('/years', requirePermission('students:read'), async (req, res, next) => {
  try {
    const tenantId = req.tenant._id;
    const years = await withCache(`years:${tenantId}`, 300, () =>
      AcademicYear.find({ tenantId }).sort({ startDate: -1 }).lean()
    );
    res.json(years);
  } catch (err) {
    next(err);
  }
});

router.get('/years/:id', requirePermission('students:read'), async (req, res, next) => {
  try {
    const year = await AcademicYear.findOne({
      _id: req.params.id,
      tenantId: req.tenant._id,
    }).lean();
    if (!year) return res.status(404).json({ error: 'Not found' });
    res.json(year);
  } catch (err) {
    next(err);
  }
});

router.patch('/years/:id/activate', requirePermission('tenant:admin'), async (req, res, next) => {
  try {
    const tenantId = req.tenant._id;
    await AcademicYear.updateMany({ tenantId }, { $set: { isActive: false } });
    const year = await AcademicYear.findOneAndUpdate(
      { _id: req.params.id, tenantId },
      { $set: { isActive: true } },
      { new: true }
    );
    if (!year) return res.status(404).json({ error: 'Not found' });
    await invalidateCache(`years:${tenantId}`);
    res.json(year);
  } catch (err) {
    next(err);
  }
});

// ── Terms ─────────────────────────────────────────────────────────────────────

router.post('/terms', requirePermission('tenant:admin'), async (req, res, next) => {
  try {
    const { academicYearId, name, startDate, endDate } = req.body;
    const term = await Term.create({
      tenantId: req.tenant._id,
      academicYearId,
      name,
      startDate,
      endDate,
    });
    res.status(201).json(term);
  } catch (err) {
    next(err);
  }
});

router.get('/terms', requirePermission('students:read'), async (req, res, next) => {
  try {
    const filter = { tenantId: req.tenant._id };
    if (req.query.yearId) filter.academicYearId = req.query.yearId;
    const terms = await Term.find(filter).sort({ startDate: 1 }).lean();
    res.json(terms);
  } catch (err) {
    next(err);
  }
});

router.patch('/terms/:id', requirePermission('tenant:admin'), async (req, res, next) => {
  try {
    const term = await Term.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenant._id },
      { $set: req.body },
      { new: true }
    );
    if (!term) return res.status(404).json({ error: 'Not found' });
    res.json(term);
  } catch (err) {
    next(err);
  }
});

// ── Classes ───────────────────────────────────────────────────────────────────

router.post('/classes', requirePermission('tenant:admin'), async (req, res, next) => {
  try {
    const { name, gradeLevel } = req.body;
    const cls = await Class.create({ tenantId: req.tenant._id, name, gradeLevel });
    res.status(201).json(cls);
  } catch (err) {
    next(err);
  }
});

router.get('/classes', requirePermission('students:read'), async (req, res, next) => {
  try {
    const classes = await Class.find({ tenantId: req.tenant._id }).sort({ gradeLevel: 1 }).lean();

    if (req.query.includeSections === 'true') {
      const sections = await Section.find({ tenantId: req.tenant._id }).lean();
      const sectionsByClass = {};
      for (const s of sections) {
        const key = s.classId.toString();
        if (!sectionsByClass[key]) sectionsByClass[key] = [];
        sectionsByClass[key].push(s);
      }
      const result = classes.map((c) => ({
        ...c,
        sections: sectionsByClass[c._id.toString()] || [],
      }));
      return res.json(result);
    }

    res.json(classes);
  } catch (err) {
    next(err);
  }
});

// ── Sections ──────────────────────────────────────────────────────────────────

router.post('/sections', requirePermission('tenant:admin'), async (req, res, next) => {
  try {
    const { classId, name, classTeacherId } = req.body;
    const section = await Section.create({
      tenantId: req.tenant._id,
      classId,
      name,
      classTeacherId,
    });
    res.status(201).json(section);
  } catch (err) {
    next(err);
  }
});

router.get('/sections', requirePermission('students:read'), async (req, res, next) => {
  try {
    const filter = { tenantId: req.tenant._id };
    if (req.query.classId) filter.classId = req.query.classId;
    const sections = await Section.find(filter).sort({ name: 1 }).lean();
    res.json(sections);
  } catch (err) {
    next(err);
  }
});

router.patch('/sections/:id', requirePermission('tenant:admin'), async (req, res, next) => {
  try {
    const section = await Section.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenant._id },
      { $set: req.body },
      { new: true }
    );
    if (!section) return res.status(404).json({ error: 'Not found' });
    res.json(section);
  } catch (err) {
    next(err);
  }
});

// ── Subjects ──────────────────────────────────────────────────────────────────

router.post('/subjects', requirePermission('tenant:admin'), async (req, res, next) => {
  try {
    const { name, code, classId, creditHours } = req.body;
    const subject = await Subject.create({
      tenantId: req.tenant._id,
      name,
      code,
      classId,
      creditHours,
    });
    res.status(201).json(subject);
  } catch (err) {
    next(err);
  }
});

router.get('/subjects', requirePermission('students:read'), async (req, res, next) => {
  try {
    const filter = { tenantId: req.tenant._id };
    if (req.query.classId) filter.classId = req.query.classId;
    const subjects = await Subject.find(filter).sort({ name: 1 }).lean();
    res.json(subjects);
  } catch (err) {
    next(err);
  }
});

router.patch('/subjects/:id', requirePermission('tenant:admin'), async (req, res, next) => {
  try {
    const subject = await Subject.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenant._id },
      { $set: req.body },
      { new: true }
    );
    if (!subject) return res.status(404).json({ error: 'Not found' });
    res.json(subject);
  } catch (err) {
    next(err);
  }
});

// ── Students ──────────────────────────────────────────────────────────────────

router.post('/students', requirePermission('students:write'), async (req, res, next) => {
  try {
    const { admissionNo, firstName, lastName, sectionId, dateOfBirth, gender, parentContacts } =
      req.body;
    const tenantId = req.tenant._id;

    const existing = await Student.findOne({ tenantId, admissionNo });
    if (existing) return res.status(409).json({ error: 'Admission number already exists' });

    const student = await Student.create({
      tenantId,
      admissionNo,
      firstName,
      lastName,
      sectionId,
      dateOfBirth,
      gender,
      parentContacts,
    });
    res.status(201).json(student);
  } catch (err) {
    next(err);
  }
});

router.get('/students', requirePermission('students:read'), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 20);
    const filter = { tenantId: req.tenant._id };
    if (req.query.sectionId) filter.sectionId = req.query.sectionId;
    if (req.query.status) filter.status = req.query.status;

    const [students, total] = await Promise.all([
      Student.find(filter)
        .sort({ lastName: 1, firstName: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Student.countDocuments(filter),
    ]);

    res.json({ students, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
});

router.get('/students/:id', requirePermission('students:read'), async (req, res, next) => {
  try {
    const student = await Student.findOne({ _id: req.params.id, tenantId: req.tenant._id }).lean();
    if (!student) return res.status(404).json({ error: 'Not found' });
    res.json(student);
  } catch (err) {
    next(err);
  }
});

router.patch('/students/:id', requirePermission('students:write'), async (req, res, next) => {
  try {
    const student = await Student.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenant._id },
      { $set: req.body },
      { new: true }
    );
    if (!student) return res.status(404).json({ error: 'Not found' });
    res.json(student);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/students/import',
  requirePermission('students:write'),
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

      const records = parse(req.file.buffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });

      const tenantId = req.tenant._id;
      let created = 0;
      let skipped = 0;
      const errors = [];

      for (const row of records) {
        try {
          const {
            admissionNo,
            firstName,
            lastName,
            sectionId: sectionName,
            dateOfBirth,
            gender,
          } = row;

          if (!admissionNo || !firstName || !lastName) {
            errors.push({ row, reason: 'Missing required fields' });
            continue;
          }

          const existing = await Student.findOne({ tenantId, admissionNo });
          if (existing) {
            skipped++;
            continue;
          }

          let resolvedSectionId;
          if (sectionName) {
            const section = await Section.findOne({ tenantId, name: sectionName });
            if (section) resolvedSectionId = section._id;
          }

          await Student.create({
            tenantId,
            admissionNo,
            firstName,
            lastName,
            sectionId: resolvedSectionId,
            dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
            gender: gender || undefined,
          });
          created++;
        } catch (rowErr) {
          errors.push({ row, reason: rowErr.message });
        }
      }

      res.json({ created, skipped, errors });
    } catch (err) {
      next(err);
    }
  }
);

// ── Timetable ─────────────────────────────────────────────────────────────────

router.post('/timetable', requirePermission('tenant:admin'), async (req, res, next) => {
  try {
    const {
      academicYearId,
      sectionId,
      subjectId,
      teacherId,
      dayOfWeek,
      periodNumber,
      startTime,
      endTime,
    } = req.body;
    const tenantId = req.tenant._id;

    const teacherConflict = await Timetable.findOne({
      tenantId,
      academicYearId,
      teacherId,
      dayOfWeek,
      periodNumber,
    });
    if (teacherConflict)
      return res.status(409).json({ error: 'Teacher already has a class at this time' });

    const sectionConflict = await Timetable.findOne({
      tenantId,
      academicYearId,
      sectionId,
      dayOfWeek,
      periodNumber,
    });
    if (sectionConflict)
      return res.status(409).json({ error: 'Section already has a class at this period' });

    const entry = await Timetable.create({
      tenantId,
      academicYearId,
      sectionId,
      subjectId,
      teacherId,
      dayOfWeek,
      periodNumber,
      startTime,
      endTime,
    });
    res.status(201).json(entry);
  } catch (err) {
    next(err);
  }
});

router.get('/timetable', requirePermission('students:read'), async (req, res, next) => {
  try {
    const filter = { tenantId: req.tenant._id };
    if (req.query.sectionId) filter.sectionId = req.query.sectionId;
    if (req.query.teacherId) filter.teacherId = req.query.teacherId;
    if (req.query.yearId) filter.academicYearId = req.query.yearId;

    const entries = await Timetable.find(filter)
      .populate('subjectId', 'name code')
      .populate('sectionId', 'name')
      .populate('teacherId', 'firstName lastName email')
      .sort({ dayOfWeek: 1, periodNumber: 1 })
      .lean();

    res.json(entries);
  } catch (err) {
    next(err);
  }
});

router.delete('/timetable/:id', requirePermission('tenant:admin'), async (req, res, next) => {
  try {
    const entry = await Timetable.findOneAndDelete({
      _id: req.params.id,
      tenantId: req.tenant._id,
    });
    if (!entry) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

// ── Attendance ────────────────────────────────────────────────────────────────

router.post('/attendance', requirePermission('attendance:write'), async (req, res, next) => {
  try {
    const { date, sectionId, subjectId, records } = req.body;
    const tenantId = req.tenant._id;
    const markedBy = req.user.sub;

    const ops = records.map(({ entityId, status, note }) => ({
      updateOne: {
        filter: { tenantId, date: new Date(date), entityType: 'student', entityId },
        update: {
          $set: {
            tenantId,
            date: new Date(date),
            entityType: 'student',
            entityId,
            sectionId,
            subjectId,
            status,
            markedBy,
            note,
          },
        },
        upsert: true,
      },
    }));

    await AttendanceRecord.bulkWrite(ops);
    res.json({ saved: ops.length });
  } catch (err) {
    next(err);
  }
});

router.get('/attendance', requirePermission('attendance:read'), async (req, res, next) => {
  try {
    const filter = { tenantId: req.tenant._id };
    if (req.query.sectionId) filter.sectionId = req.query.sectionId;
    if (req.query.entityId) filter.entityId = req.query.entityId;
    if (req.query.date) filter.date = new Date(req.query.date);
    if (req.query.from || req.query.to) {
      filter.date = {};
      if (req.query.from) filter.date.$gte = new Date(req.query.from);
      if (req.query.to) filter.date.$lte = new Date(req.query.to);
    }

    const records = await AttendanceRecord.find(filter).sort({ date: -1 }).lean();
    res.json(records);
  } catch (err) {
    next(err);
  }
});

// ── Grades ────────────────────────────────────────────────────────────────────

router.post('/grades', requirePermission('grades:write'), async (req, res, next) => {
  try {
    const { grades } = req.body;
    const tenantId = req.tenant._id;
    const gradedBy = req.user.sub;

    const ops = grades.map(
      ({
        studentId,
        subjectId,
        termId,
        academicYearId,
        score,
        letterGrade,
        weightage,
        remarks,
      }) => ({
        updateOne: {
          filter: { tenantId, studentId, subjectId, termId },
          update: {
            $set: {
              tenantId,
              studentId,
              subjectId,
              termId,
              academicYearId,
              score,
              letterGrade,
              weightage: weightage ?? 1,
              gradedBy,
              remarks,
            },
          },
          upsert: true,
        },
      })
    );

    await Grade.bulkWrite(ops);
    res.json({ saved: ops.length });
  } catch (err) {
    next(err);
  }
});

router.get('/grades', requirePermission('grades:read'), async (req, res, next) => {
  try {
    const filter = { tenantId: req.tenant._id };
    if (req.query.studentId) filter.studentId = req.query.studentId;
    if (req.query.subjectId) filter.subjectId = req.query.subjectId;
    if (req.query.termId) filter.termId = req.query.termId;

    const grades = await Grade.find(filter)
      .populate('studentId', 'firstName lastName admissionNo')
      .populate('subjectId', 'name code')
      .lean();

    res.json(grades);
  } catch (err) {
    next(err);
  }
});

// ── Report Card ───────────────────────────────────────────────────────────────

router.post('/report-card/generate', requirePermission('grades:read'), async (req, res, next) => {
  try {
    const { termId, sectionId } = req.body;
    const job = await reportCardQueue.add('generate', {
      tenantId: req.tenant._id.toString(),
      termId,
      sectionId,
      requestedBy: req.user.sub,
    });
    res.json({ jobId: job.id });
  } catch (err) {
    next(err);
  }
});

router.get('/report-card/status/:jobId', async (req, res, next) => {
  try {
    const job = await reportCardQueue.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const state = await job.getState();
    const result = job.returnvalue;

    res.json({ jobId: job.id, state, result });
  } catch (err) {
    next(err);
  }
});

export default router;
