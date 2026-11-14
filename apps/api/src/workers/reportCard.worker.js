import { Worker } from 'bullmq';
import { REPORT_CARD_EXCLUDED_ASSESSMENT_TYPES } from '@rooted/shared/constants';
import { redis } from '../config/redis.js';
import { logger } from '../utils/logger.js';
import { Student } from '../models/Student.js';
import { Grade } from '../models/Grade.js';
import { AttendanceRecord } from '../models/AttendanceRecord.js';
import { Section } from '../models/Section.js';
import { Term } from '../models/Term.js';
import { Tenant } from '../models/Tenant.js';
import { ReportCardBatch } from '../models/ReportCardBatch.js';
import { computeGradeStats } from '../utils/gradeStats.js';
import { computeAttendanceStats } from '../utils/attendanceStats.js';
import { uploadBuffer, getSignedUrl } from '../services/storage.service.js';
import { loadReportCardLogo } from '../services/reportCardLogo.service.js';
import { resolveReportCardConfig } from '../utils/reportCardConfig.js';
import { renderReportCardPdf } from '../utils/reportCardLayouts.js';

const ATTENDANCE_THRESHOLD_PCT = 75;

async function loadReportCardData(tenantId, termId, sectionId) {
  const [section, term, tenant] = await Promise.all([
    Section.findOne({ _id: sectionId, tenantId }).populate('classId', 'name').lean(),
    Term.findOne({ _id: termId, tenantId }).lean(),
    Tenant.findById(tenantId).lean(),
  ]);

  const config = resolveReportCardConfig(tenant);
  const logo = await loadReportCardLogo(config.logoKey);

  const students = await Student.find({ tenantId, sectionId, status: 'active' }).lean();
  const studentIds = students.map((s) => s._id);

  const [grades, attendanceRecords] = await Promise.all([
    // Baseline and mock-interview scores are training diagnostics, not term
    // results — they must not appear on, or skew, a report card.
    Grade.find({
      tenantId,
      termId,
      studentId: { $in: studentIds },
      assessmentType: { $nin: REPORT_CARD_EXCLUDED_ASSESSMENT_TYPES },
    })
      .populate('subjectId', 'name code')
      .lean(),
    AttendanceRecord.find({
      tenantId,
      sectionId,
      entityType: 'student',
      entityId: { $in: studentIds },
      date: { $gte: term.startDate, $lte: term.endDate },
    }).lean(),
  ]);

  const gradesByStudent = {};
  for (const g of grades) {
    const key = g.studentId.toString();
    if (!gradesByStudent[key]) gradesByStudent[key] = [];
    gradesByStudent[key].push(g);
  }

  const gradeStats = computeGradeStats(students, grades);
  const attendanceStats = computeAttendanceStats(
    students,
    attendanceRecords,
    ATTENDANCE_THRESHOLD_PCT
  );
  const attendanceByStudent = Object.fromEntries(
    attendanceStats.students.map((s) => [s.studentId, s])
  );
  const gradeStatsByStudent = Object.fromEntries(gradeStats.students.map((s) => [s.studentId, s]));

  return {
    section,
    term,
    tenant,
    config,
    logo,
    students,
    gradesByStudent,
    gradeStatsByStudent,
    attendanceByStudent,
    rankedCount: gradeStats.rankedCount,
  };
}

async function generateReportCardPdf(job, tenantId, termId, sectionId) {
  const {
    section,
    term,
    config,
    logo,
    students,
    gradesByStudent,
    gradeStatsByStudent,
    attendanceByStudent,
    rankedCount,
  } = await loadReportCardData(tenantId, termId, sectionId);

  const sectionLabel = section?.classId?.name
    ? `${section.classId.name} - ${section.name}`
    : (section?.name ?? '—');
  const termLabel = term?.name ?? '—';

  const pdf = await renderReportCardPdf({
    students,
    sectionLabel,
    termLabel,
    gradesByStudent,
    gradeStatsByStudent,
    attendanceByStudent,
    rankedCount,
    config,
    logo,
    // Real per-card progress for the mobile job-status screen (docs/mobile-ui/
    // 09-report-cards-approved.html §1/§4) — a ring showing "13 of 21", not a spinner.
    onProgress: (progress) => job.updateProgress(progress),
  });
  return { pdf, config };
}

export function startReportCardWorker() {
  const worker = new Worker(
    'report-card',
    async (job) => {
      const { tenantId, termId, sectionId } = job.data;

      const { pdf: pdfBuffer, config } = await generateReportCardPdf(
        job,
        tenantId,
        termId,
        sectionId
      );
      const key = `report-cards/${tenantId}/${termId}/${sectionId}/${Date.now()}.pdf`;

      await uploadBuffer(key, pdfBuffer, 'application/pdf');
      const url = await getSignedUrl(key, 3600);

      await ReportCardBatch.updateOne(
        { jobId: job.id, tenantId },
        { $set: { status: 'completed', s3Key: key, config } }
      );

      return { url };
    },
    { connection: redis, concurrency: 2 }
  );

  worker.on('failed', async (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Report card job failed');
    if (!job) return;
    try {
      await ReportCardBatch.updateOne(
        { jobId: job.id, tenantId: job.data?.tenantId },
        { $set: { status: 'failed', error: err?.message ?? 'Unknown error' } }
      );
    } catch (updateErr) {
      logger.error({ jobId: job.id, err: updateErr }, 'Failed to record report card job failure');
    }
  });

  logger.info('Report card worker started');
  return worker;
}
