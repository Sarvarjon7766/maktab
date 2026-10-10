const { Schema, model } = require('mongoose')

// Tuman (yoki viloyat chegarasi): tizim egasi boshqaradi. Maktablar va monitorlar shu tumanga biriktiriladi,
// xaritada chegarasi (GeoJSON) ko'rsatiladi
const districtSchema = new Schema({
	name: { type: String, required: true, trim: true },          // "Bulung'ur"
	region: { type: String, default: '', trim: true },            // "Samarqand"
	slug: { type: String, required: true, unique: true, trim: true },
	isRegion: { type: Boolean, default: false },                  // viloyat chegarasi (xarita foni), maktab/monitor biriktirilmaydi
	geometry: { type: Schema.Types.Mixed, default: null },        // GeoJSON Polygon | MultiPolygon
	bbox: { type: [Number], default: undefined },                 // [minLng, minLat, maxLng, maxLat]
	center: { lat: Number, lng: Number },
	source: { type: String, enum: ['bundled', 'custom'], default: 'custom' },
	isActive: { type: Boolean, default: true }
}, { timestamps: true })

districtSchema.index({ region: 1, name: 1 })

module.exports = model('District', districtSchema)
