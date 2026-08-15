/**
 * Mongoose plugin that enforces tenantId on every query and throws on create without it.
 * Applied to every tenant-scoped model.
 */
export function tenantScopePlugin(schema) {
  schema.pre(/^find/, function () {
    if (this._tenantScoped) return;
    // Super-admin bypass: call query.bypassTenantScope() before exec
    if (!this.options._bypassTenantScope) {
      const filter = this.getFilter();
      if (!filter.tenantId) {
        // Mongoose populate sub-queries only have _id in the filter — allow them through.
        // The parent query already enforced tenant isolation.
        const keys = Object.keys(filter);
        if (keys.length === 1 && keys[0] === '_id') return;
        throw new Error('tenantId missing from query — tenant isolation violation');
      }
    }
  });

  schema.pre('save', function () {
    if (!this.tenantId) {
      throw new Error('tenantId required on save');
    }
  });

  schema.pre(/^(updateOne|updateMany|findOneAndUpdate)$/, function () {
    if (this.options._bypassTenantScope) return;
    const filter = this.getFilter();
    if (!filter.tenantId) {
      throw new Error('tenantId missing from update — tenant isolation violation');
    }
  });
}
