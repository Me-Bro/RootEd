import mongoose from 'mongoose';
import { tenantScopePlugin } from './plugins/tenantScope.js';

const feeStructureSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    name: { type: String, required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    components: [
      {
        label: { type: String, required: true },
        amount: { type: Number, required: true },
        isOptional: { type: Boolean, default: false },
      },
    ],
    applicableTo: { type: String, enum: ['all', 'class', 'student'], default: 'all' },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
    dueDate: { type: Date },
    installments: [
      {
        label: { type: String, required: true },
        amount: { type: Number, required: true },
        dueDate: { type: Date, required: true },
      },
    ],
    lateFeeEnabled: { type: Boolean, default: false },
    lateFeeType: { type: String, enum: ['flat', 'percentage'] },
    lateFeeValue: { type: Number },
    lateFeeGraceDays: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    // Study centers only: what this structure sells and for how long. A structure
    // with a plan has no installments and is bought one learner at a time (a sale).
    plan: {
      kind: { type: String, enum: ['day_pass', 'shift_plan'] },
      durationDays: { type: Number, min: 1 },
      sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section' },
    },
  },
  { timestamps: true }
);

feeStructureSchema.plugin(tenantScopePlugin);
feeStructureSchema.index({ tenantId: 1, academicYearId: 1 });

export const FeeStructure = mongoose.model('FeeStructure', feeStructureSchema);
