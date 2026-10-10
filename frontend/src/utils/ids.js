// Xodimning hodimID si Mongo _id bilan bir xil (24 belgili hex): uni ekranda, hisobotda va havolada ko'rsatmaymiz.
export const publicId = (v) => (v && !/^[a-f0-9]{24}$/i.test(String(v)) ? v : '')
