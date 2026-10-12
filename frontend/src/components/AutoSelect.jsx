import { Children, isValidElement } from 'react'
import SearchableSelect from './SearchableSelect'

// <select> o'rnida ishlatiladigan qidiruvli ro'yxat: odatiy <option> bolalarini o'qiydi, onChange ga { target: { value } } beradi.
// Variantlar 6 tadan ko'p bo'lsa ichida qidiruv maydoni chiqadi.
const collect = (children, out = []) => {
	Children.forEach(children, (c) => {
		if (!isValidElement(c)) return
		if (c.type === 'option') out.push({ value: c.props.value ?? '', label: Children.toArray(c.props.children).join(''), disabled: c.props.disabled })
		else if (c.props?.children) collect(c.props.children, out)
	})
	return out
}

const AutoSelect = ({ value, onChange, children, className = '', disabled, name }) => {
	const options = collect(children)
	const wide = /\bw-full\b/.test(className)
	const flat = /bg-transparent/.test(className)
	return (
		<SearchableSelect
			value={value ?? ''}
			onChange={(v) => onChange?.({ target: { value: v, name } })}
			options={options}
			icon={false}
			searchFrom={6}
			variant={flat ? 'filled' : 'outline'}
			className={disabled ? 'pointer-events-none opacity-60 ' + (wide ? 'w-full' : 'min-w-[160px] max-w-[280px]') : wide ? 'w-full' : 'min-w-[160px] max-w-[280px]'}
		/>
	)
}

export default AutoSelect
