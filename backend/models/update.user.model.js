const { model, Schema } = require('mongoose')

const updateuserSchema = new Schema({
	schoolId: {
		type: Schema.Types.ObjectId,
		ref: 'School',
		index: true,
		required: true
	},
	action: {
		type: String,
		required: true,
		default: 'update'
	},
	userId: {
		type: Schema.Types.ObjectId,
		required: true,
		ref: 'User'
	},
	full_name: {
		type: String,
		required: true
	},
	hodimID: {
		type: String,
		required: true
	},
	photo: String,
	createdAt: {
		type: Date,
		default: Date.now
	}
})

module.exports = model('updateuser', updateuserSchema)

