import mongoose from 'mongoose';
import { tenantScopePlugin } from './plugins/tenantScope.js';

const classSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    name: { type: String, required: true },
    gradeLevel: { type: Number },
    // HH:mm hours of a study center's batch, which is its shift (Morning, Evening). Labels
    // only: the seat map and the learner's page show them, nothing enforces them. The
    // batch's one Section mirrors them (see services/batch.service.js).
    startTime: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    endTime: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
  },
  { timestamps: true }
);

classSchema.plugin(tenantScopePlugin);
classSchema.index({ tenantId: 1, name: 1 }, { unique: true });

export const Class = mongoose.model('Class', classSchema);
