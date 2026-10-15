const test = require('node:test')
const assert = require('node:assert')

// Bir kamera faqat bitta sinfga tegishli: DB'siz, modellar almashtirilgan holda
const hikCameraModel = require('../models/hik.camera.model')
const sinfModel = require('../models/sinf.model')
const HikService = require('../services/hikconnect.service')

const A = '6ac36de075b543144dc8e350', B = '6ac36de075b543144dc8e351', CAM = '6ac36c0487fe2a9a8a49943f', SCHOOL = '6ac36d1a75b543144dc8e194'
let cam
const mk = (o) => ({ role: 'monitor', faceDirection: 'in', visionEnabled: false, sinfId: null, save: async () => {}, ...o })

test.before(() => {
	hikCameraModel.findOne = async () => cam
	sinfModel.exists = async () => true
	sinfModel.findById = () => ({ select: () => ({ lean: async () => ({ name: '5-A' }) }) })
})

test('biriktirilmagan kamera sinfga biriktiriladi va sanash yoqiladi', async () => {
	cam = mk({})
	const r = await HikService.updateCameraSettings(SCHOOL, CAM, { sinfId: A })
	assert.ok(r.success); assert.equal(String(cam.sinfId), A); assert.equal(cam.visionEnabled, true)
})

test('boshqa sinfga biriktirilgan kamerani yana biriktirib bo\'lmaydi', async () => {
	cam = mk({ sinfId: A })
	const r = await HikService.updateCameraSettings(SCHOOL, CAM, { sinfId: B })
	assert.equal(r.success, false); assert.match(r.message, /5-A sinfiga biriktirilgan/); assert.equal(String(cam.sinfId), A)
})

test('o\'sha sinfga qayta biriktirish sanashni o\'zgartirmaydi', async () => {
	cam = mk({ sinfId: A, visionEnabled: false })
	const r = await HikService.updateCameraSettings(SCHOOL, CAM, { sinfId: A })
	assert.ok(r.success); assert.equal(cam.visionEnabled, false)
})

test('ajratilgach boshqa sinfga biriktiriladi; ommaviy yo\'lda ham qoida ishlaydi', async () => {
	cam = mk({ sinfId: A })
	assert.ok((await HikService.updateCameraSettings(SCHOOL, CAM, { sinfId: null })).success)
	assert.ok((await HikService.updateCameraSettings(SCHOOL, CAM, { sinfId: B })).success)
	cam = mk({ sinfId: A })
	const bulk = await HikService.bulkUpdateCameras(SCHOOL, [CAM], { sinfId: B })
	assert.equal(bulk.success, false); assert.equal(bulk.failed.length, 1)
})
