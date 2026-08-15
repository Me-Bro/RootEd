/**
 * migrate-from-excel.js
 * Usage: node src/scripts/migrate-from-excel.js --tenantId=xxx --file=students.csv
 *
 * Expected CSV columns:
 *   admissionNo, firstName, lastName, class, section, dateOfBirth, gender, parentPhone
 *
 * Required env vars: MONGODB_URI
 */

import '../config/env.js';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Tenant } from '../models/Tenant.js';
import { Class } from '../models/Class.js';
import { Section } from '../models/Section.js';
import { Student } from '../models/Student.js';

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const [key, val] = arg.replace(/^--/, '').split('=');
    args[key] = val;
  }
  return args;
}

async function run() {
  const { tenantId, file } = parseArgs();

  if (!tenantId || !file) {
    console.error('Usage: node src/scripts/migrate-from-excel.js --tenantId=xxx --file=students.csv');
    process.exit(1);
  }

  const filePath = path.resolve(file);
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  await mongoose.connect(env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const tenant = await Tenant.findById(tenantId);
  if (!tenant) {
    console.error(`Tenant not found: ${tenantId}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`Migrating for tenant: ${tenant.name} (${tenantId})`);

  const csvContent = fs.readFileSync(filePath, 'utf8');
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const stats = { created: 0, updated: 0, errors: [] };

  for (const row of records) {
    try {
      const { admissionNo, firstName, lastName, class: className, section: sectionName, dateOfBirth, gender, parentPhone } = row;

      if (!admissionNo || !firstName || !lastName) {
        stats.errors.push({ row, reason: 'Missing required fields: admissionNo, firstName, lastName' });
        continue;
      }

      // Find or create Class
      let cls = await Class.findOne({ tenantId, name: className });
      if (!cls && className) {
        cls = await Class.create({ tenantId, name: className });
        console.log(`  Created class: ${className}`);
      }

      // Find or create Section
      let section = null;
      if (sectionName && cls) {
        section = await Section.findOne({ tenantId, classId: cls._id, name: sectionName });
        if (!section) {
          section = await Section.create({ tenantId, classId: cls._id, name: sectionName });
          console.log(`  Created section: ${sectionName} in ${className}`);
        }
      }

      // Upsert Student
      const existing = await Student.findOne({ tenantId, admissionNo });
      const parentContacts = parentPhone ? [{ name: 'Parent', phone: parentPhone, relation: 'parent' }] : [];

      if (existing) {
        await Student.updateOne(
          { tenantId, admissionNo },
          {
            $set: {
              firstName,
              lastName,
              sectionId: section?._id,
              dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : existing.dateOfBirth,
              gender: gender || existing.gender,
              parentContacts,
            },
          }
        );
        stats.updated++;
        process.stdout.write('u');
      } else {
        await Student.create({
          tenantId,
          admissionNo,
          firstName,
          lastName,
          sectionId: section?._id,
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
          gender: gender || undefined,
          parentContacts,
        });
        stats.created++;
        process.stdout.write('.');
      }
    } catch (err) {
      stats.errors.push({ row, reason: err.message });
      process.stdout.write('E');
    }
  }

  console.log('\n\nMigration complete:');
  console.log(JSON.stringify(stats, null, 2));

  await mongoose.disconnect();
  process.exit(stats.errors.length > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
