import mongoose from 'mongoose';
import { tenantScopePlugin } from './plugins/tenantScope.js';

// One student's result on one Assignment. A student with no row has simply not
// been recorded yet — absence is not the same as `pending`.
const submissionSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    status: { type: String, enum: ['pending', 'submitted', 'reviewed'], default: 'pending' },
    submittedAt: { type: Date },
    // Only meaningful once reviewed; null otherwise. Never defaulted to 0, so a
    // missing score cannot be mistaken for a real zero.
    score: { type: Number, min: 0, default: null },
    feedback: { type: String },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
  },
  { timestamps: true }
);

submissionSchema.plugin(tenantScopePlugin);
submissionSchema.index({ tenantId: 1, assignmentId: 1, studentId: 1 }, { unique: true });
submissionSchema.index({ tenantId: 1, studentId: 1 });

export const Submission = mongoose.model('Submission', submissionSchema);
