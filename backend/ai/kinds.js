// Aqlli kuzatuv hodisa turlari (bitta joyda): muhim ogohlantirishlar va avtomatik namuna
const ALERT_KINDS = ['vision_empty', 'vision_surge', 'vision_overcrowd', 'vision_restless', 'vision_commotion']
const SAMPLE_KIND = 'vision_sample'
const ALL_KINDS = [...ALERT_KINDS, SAMPLE_KIND]

module.exports = { ALERT_KINDS, SAMPLE_KIND, ALL_KINDS }
