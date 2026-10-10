// Viloyat serveri /api/monitor/* yo'llarining jadvali. Har yo'l uchun bitta yozuv:
//   { merge(parts, ctx), ttl, regionOnly, prepare(query, ctx), optionalSchool }   — hamma tumanlarga so'rov + jamlash ("scatter")
//   { owner: 'params.id' | 'query.schoolId' }                                       — maktab egasi tumanga to'g'ridan-to'g'ri uzatish (proksi)
//   { ownerPerson: true }                                                           — shaxs (o'quvchi/xodim) egasini topib uzatish
//   { local(ctx, req) }                                                             — viloyat serverining o'zida hisoblanadi
// Federatsiya API yo'li shu yo'lning o'zi: GET /api/federation/v1/monitor<path>.
const owners = {
	'/school/:id': { owner: 'params.id', ttl: 45000 },
	'/school/:id/staff': { owner: 'params.id' },
	'/school/:id/students': { owner: 'params.id' },
	'/classes': { owner: 'query.schoolId' },
	'/absent-students': { owner: 'query.schoolId' },
	'/person/:kind/:id': { ownerPerson: true },
	'/person-day/:kind/:id': { ownerPerson: true }
}

module.exports = {
	...require('./merge/overview'),
	...require('./merge/lists'),
	...require('./merge/local'),
	...owners
}
