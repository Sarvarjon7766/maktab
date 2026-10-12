import { tx } from '../../i18n'
import { useMemo } from 'react'
import { FiArrowRight, FiClock, FiLogIn, FiLogOut, FiUser } from 'react-icons/fi'
import { FaChalkboardTeacher } from 'react-icons/fa'
import { Link, useNavigate } from 'react-router-dom'
import { ViewerStatsProvider } from '../../components/SchoolStatsShell'
import { LoadState, Page, Panel, PersonLink, WEEKDAYS, fmt, levelColor, levelText, shiftDate, todayStr, usePanel, useMonitorData, pctFmt } from '../monitor/monitorKit'
import { uploadUrl } from '../../utils/uploadUrl'

const MONTHS = [tx('yanvar'), tx('fevral'), tx('mart'), tx('aprel'), tx('may'), tx('iyun'), tx('iyul'), tx('avgust'), tx('sentyabr'), tx('oktyabr'), tx('noyabr'), tx('dekabr')]
const SHORT_DAYS = [tx('Ya'), tx('Du'), tx('Se'), tx('Ch'), tx('Pa'), tx('Ju'), tx('Sh')]
const STATUS = {
	present: [tx('Vaqtida keldi'), 'bg-emerald-500/20 text-emerald-100 ring-emerald-300/40'],
	late: [tx('Kech qoldi'), 'bg-orange-500/25 text-orange-100 ring-orange-300/40'],
	absent: [tx('Hali kelmadi'), 'bg-rose-500/25 text-rose-100 ring-rose-300/40'],
	excused: [tx('Sababli'), 'bg-violet-500/25 text-violet-100 ring-violet-300/40'],
	off: [tx('Dam olish kuni'), 'bg-white/15 text-white ring-white/30'],
}
// kunlik katakcha ranglari (oxirgi 14 kun)
const CELL = {
	present: 'bg-emerald-500 text-white',
	late: 'bg-orange-400 text-white',
	absent: 'bg-rose-500 text-white',
	excused: 'bg-violet-400 text-white',
	off: 'bg-slate-100 text-slate-400',
}
const CELL_LABEL = { present: tx('Keldi'), late: tx('Kech qoldi'), absent: tx('Kelmadi'), excused: tx('Sababli'), off: tx('Dam olish') }
const dur = (m) => (m === null || m === undefined ? '—' : m >= 60 ? tx('{{h}} s {{m}} d', { h: Math.floor(m / 60), m: String(m % 60).padStart(2, '0') }) : tx('{{m}} d', { m }))
const greet = () => { const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', hour: '2-digit', hour12: false }).format(new Date())); return h < 5 ? tx('Xayrli tun') : h < 12 ? tx('Xayrli tong') : h < 18 ? tx('Xayrli kun') : tx('Xayrli kech') }

const Tile = ({ label, value, sub, tone = 'text-slate-900', percent, to }) => {
	const Root = to ? Link : 'div'
	return (
	<Root {...(to ? { to } : {})} className={`block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${to ? 'transition hover:-translate-y-0.5 hover:shadow-md' : ''}`}>
		<p className="text-xs font-medium text-slate-500">{label}</p>
		<p className={`mt-2 text-3xl font-bold leading-none ${tone}`}>{value}</p>
		{percent !== undefined && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${levelColor(percent)}`} style={{ width: `${Math.min(percent, 100)}%` }} /></div>}
		{sub && <p className="mt-2 text-xs text-slate-400">{sub}</p>}
	</Root>
	)
}

const Dashboard = () => {
	const { base } = usePanel()
	const navigate = useNavigate()
	const today = todayStr()
	const { data, loading, error } = useMonitorData('dashboard', { date: today, from: shiftDate(today, -29), to: today }, { auto: true })
	const u = data?.user, day = data?.today, st = data?.stats
	const classes = useMemo(() => data?.classes || [], [data])
	const recent = data?.recent || []
	const [y, mo, d] = today.split('-').map(Number)
	const weekday = new Date(`${today}T00:00:00Z`).getUTCDay()
	const dateLabel = `${d} ${MONTHS[mo - 1]}, ${y} · ${WEEKDAYS[weekday]}`
	const first = (u?.fullName || '').split(' ').slice(1).join(' ') || u?.fullName || ''
	// "off" faqat yakshanba uchun dam olish kuni; ish kunida hali hech kim kelmagan bo'lsa ham "Hali kelmadi"
	const key = day?.status === 'off' && weekday !== 0 ? 'absent' : (day?.status || 'off')
	const [label, chip] = STATUS[key]
	const sum = day?.summary
	const visits = day?.visits || []
	const myPath = u?._id ? `${base}/people/staff/me` : base
	const classLink = (c) => `${base}/grades/${c.grade}/${c._id}`
	const cells = recent.map(r => ({ ...r, key: r.status === 'present' && r.late ? 'late' : r.status }))
	const counts = cells.reduce((a, c) => ({ ...a, [c.key]: (a[c.key] || 0) + 1 }), {})

	return (
		<Page>
			<LoadState loading={loading && !data} error={error}>
				{data && (
					<div className="space-y-6">
						<section className="overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-blue-900 to-cyan-700 p-6 text-white shadow-sm">
							<div className="flex flex-wrap items-center justify-between gap-5">
								<div className="flex min-w-0 items-center gap-4">
									<span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/15 text-2xl font-semibold ring-1 ring-white/30">
										{u?.photo ? <img src={`${uploadUrl(u.photo)}`} alt="" className="h-full w-full object-cover" onError={e => { e.currentTarget.style.display = 'none' }} /> : <FiUser />}
									</span>
									<div className="min-w-0">
										<p className="text-xs uppercase tracking-widest text-cyan-200/80">{dateLabel}</p>
										<h1 className="mt-1 truncate text-2xl font-semibold sm:text-3xl">{greet()}, {first}</h1>
										<div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
											{u?.position && <span className="rounded-full bg-white/15 px-3 py-1">{u.position}</span>}
											{classes.map(c => <Link key={c._id} to={classLink(c)} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 font-medium text-slate-900 hover:bg-slate-100"><FaChalkboardTeacher size={12} /> {tx('Sinf rahbari: {{name}}', { name: c.name })}</Link>)}
										</div>
									</div>
								</div>
								<div className="min-w-[220px] rounded-2xl bg-white/10 p-4 ring-1 ring-white/20 backdrop-blur">
									<p className="text-xs uppercase tracking-wide text-slate-300">{tx("Bugun")}</p>
									<span className={`mt-1.5 inline-block rounded-full px-3.5 py-1 text-sm font-medium ring-1 ${chip}`}>{label}{day?.status === 'late' ? tx(' · +{{n}} daq', { n: sum.lateBy }) : ''}</span>
									<div className="mt-3 grid grid-cols-2 gap-3 text-sm">
										<div><p className="text-xs text-slate-300">{tx("Kirish")}</p><p className="font-semibold">{sum?.firstIn || '—'}</p></div>
										<div><p className="text-xs text-slate-300">{sum?.insideNow ? tx("Holat") : tx("Chiqish")}</p><p className="font-semibold">{sum?.insideNow ? tx("Ichkarida") : sum?.lastOut || '—'}</p></div>
										<div><p className="text-xs text-slate-300">{tx("Maktabda")}</p><p className="font-semibold">{sum?.insideMinutes ? dur(sum.insideMinutes) : '—'}</p></div>
										<div><p className="text-xs text-slate-300">{tx("Ish boshlanishi")}</p><p className="font-semibold">{data.workStartTime || day?.workStartTime || '—'}</p></div>
									</div>
								</div>
							</div>
						</section>

						<div>
							<div className="mb-3 flex items-center justify-between">
								<h2 className="font-semibold text-slate-900">{tx("Mening davomatim")} <span className="text-sm font-normal text-slate-400">{tx("· oxirgi 30 kun")}</span></h2>
								<Link to={myPath} className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline">{tx("Kunma-kun ko'rish")} <FiArrowRight size={14} /></Link>
							</div>
							<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
								<Tile to={myPath} label={tx("Davomat")} value={st ? (st.schoolDays ? `${pctFmt(st.percent)}` : '—') : '—'} tone={st?.schoolDays ? levelText(st.percent) : 'text-slate-400'} percent={st?.schoolDays ? st.percent : undefined} sub={st ? (st.schoolDays ? tx("{{a}} / {{b}} o'quv kuni", { a: st.present, b: st.schoolDays }) : tx("Hali o'quv kunlari qayd etilmagan")) : ''} />
								<Tile to={myPath} label={tx("Kech qolgan kunlar")} value={st ? st.late : '—'} tone={st?.late ? 'text-orange-600' : 'text-slate-900'} sub={st ? tx('sababsiz kelmagan {{n}} kun', { n: st.absent }) + (st.excused ? tx(' · sababli {{n}}', { n: st.excused }) : '') : ''} />
								<Tile to={myPath} label={tx("O'rtacha kelish")} value={st?.avgArrival || '—'} sub={tx("ish boshlanishiga nisbatan")} />
								<Tile to={`${base}/entry-exit`} label={tx("Jami ishlagan vaqt")} value={st ? tx('{{n}} soat', { n: st.totalHours }) : '—'} sub={sum?.insideMinutes ? tx('bugun {{t}}', { t: dur(sum.insideMinutes) }) : undefined} />
							</div>
						</div>

						<div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
							<Panel title={tx("Oxirgi 14 kun")} action={<Link to={myPath} className="text-sm text-blue-600 hover:underline">{tx("Batafsil →")}</Link>}>
								{cells.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">{tx("Ma'lumot yo'q")}</p> : (
									<>
										<div className="grid grid-cols-7 gap-2 md:grid-cols-[repeat(14,minmax(0,1fr))]">
											{cells.map(c => (
												<div key={c.dateString} onClick={() => navigate(myPath)} title={`${c.dateString} · ${CELL_LABEL[c.key]}${c.firstIn ? ' · ' + tx('kirish {{t}}', { t: c.firstIn }) : ''}${c.lastOut ? ' · ' + tx('chiqish {{t}}', { t: c.lastOut }) : ''}`} className="cursor-pointer text-center">
													<div className={`flex aspect-square items-center justify-center rounded-lg text-xs font-semibold ${CELL[c.key]}`}>{Number(c.dateString.slice(8))}</div>
													<p className="mt-1 text-[10px] text-slate-400">{SHORT_DAYS[c.weekday]}</p>
												</div>
											))}
										</div>
										<div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-600">
											{Object.entries(CELL_LABEL).filter(([k]) => counts[k]).map(([k, l]) => <span key={k} className="inline-flex items-center gap-1.5"><i className={`h-2.5 w-2.5 rounded ${CELL[k].split(' ')[0]}`} />{l}: <b>{counts[k]}</b></span>)}
										</div>
									</>
								)}
							</Panel>

							<Panel title={tx("Bugungi kirish-chiqishlar")} action={<Link to={`${base}/entry-exit`} className="text-sm text-blue-600 hover:underline">{tx("Hammasi →")}</Link>}>
								{visits.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">{tx("Bugun hali kirish qayd etilmagan")}</p> : (
									<ul className="space-y-2.5">
										{visits.map(v => (
											<li key={v._id || v.n} onClick={() => navigate(`${base}/entry-exit`)} className="flex cursor-pointer items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-sm transition hover:bg-slate-100">
												<span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><FiLogIn size={14} /></span>
												<span className="font-semibold text-slate-900">{v.in || '—'}</span>
												<span className="text-slate-300">→</span>
												<span className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-100 text-sky-600"><FiLogOut size={14} /></span>
												<span className="font-semibold text-slate-900">{v.out || (v.open ? tx("ichkarida") : '—')}</span>
												{v.minutes ? <span className="ml-auto inline-flex items-center gap-1 text-xs text-slate-500"><FiClock size={12} />{dur(v.minutes)}</span> : null}
											</li>
										))}
									</ul>
								)}
							</Panel>
						</div>

						{classes.length === 0 ? (
							<Panel title={tx("Sinfim")}><div className="flex items-start gap-3 py-2 text-sm text-slate-600"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><FiUser /></span><p>{tx("Sizga sinf rahbari sifatida sinf biriktirilmagan. Sinf biriktirilgach, shu yerda sinfingiz o'quvchilari va statistikasi paydo bo'ladi. Maktab admini sinf rahbarini \"Sinflar\" bo'limida belgilaydi.")}</p></div></Panel>
						) : classes.map(c => (
							<section key={c._id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
								<div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
									<div><h2 className="text-lg font-semibold text-slate-900">{tx('{{name}} sinfi', { name: c.name })}</h2><p className="text-xs text-slate-400">{tx("Bugungi davomat")}</p></div>
									<div className="flex flex-wrap gap-2 text-sm">
										<Link to={classLink(c)} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 font-medium text-white hover:bg-slate-800">{tx("Sinf statistikasi")} <FiArrowRight size={14} /></Link>
										<Link to={`${base}/late`} className="rounded-lg border border-slate-200 px-3.5 py-2 font-medium text-slate-700 hover:bg-slate-50">{tx("Kech qolganlar")}</Link>
										<Link to={`${base}/risk`} className="rounded-lg border border-slate-200 px-3.5 py-2 font-medium text-slate-700 hover:bg-slate-50">{tx("Xavf guruhi")}</Link>
									</div>
								</div>
								<div className="grid grid-cols-1 gap-6 p-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
									<div>
										<div className="flex items-end justify-between"><p className="text-5xl font-bold leading-none text-slate-900">{c.percent}<span className="text-2xl text-slate-400">%</span></p><p className="text-sm text-slate-500">{tx("{{a}} / {{b}} o'quvchi kelgan", { a: fmt(c.came), b: fmt(c.total) })}</p></div>
										<div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${levelColor(c.percent)}`} style={{ width: `${Math.min(c.percent, 100)}%` }} /></div>
										<div className="mt-5 grid grid-cols-3 gap-3 text-center">
											{[[tx("O'quvchilar"), c.total, 'text-slate-900'], [tx('Hozir maktabda'), c.inside, 'text-blue-600'], [tx('Kelmagan'), c.absent, c.absent ? 'text-rose-600' : 'text-slate-900']].map(([l, v, tone]) => (
												<Link key={l} to={classLink(c)} className="block rounded-xl bg-slate-50 px-3 py-3 transition hover:bg-slate-100"><p className={`text-xl font-bold ${tone}`}>{v}</p><p className="mt-0.5 text-[11px] text-slate-500">{l}</p></Link>
											))}
										</div>
									</div>
									<div>
										<p className="mb-2 text-xs font-semibold text-slate-500">{tx('Bugun kelmaganlar ({{n}})', { n: c.absentTotal })}</p>
										{c.absentList.length === 0 ? <p className="rounded-xl bg-emerald-50 px-4 py-6 text-center text-sm text-emerald-700">{tx("Hamma o'quvchi kelgan")}</p> : (
											<ul className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
												{c.absentList.map(s => <li key={s._id} className="border-b border-slate-50 py-2"><PersonLink kind="student" id={s._id} name={s.fullName} photo={s.photo} /></li>)}
											</ul>
										)}
										{c.absentTotal > c.absentList.length && <p className="mt-2 text-xs text-slate-400">{tx("va yana {{n}} ta o'quvchi", { n: c.absentTotal - c.absentList.length })}</p>}
									</div>
								</div>
							</section>
						))}
					</div>
				)}
			</LoadState>
		</Page>
	)
}

// O'qituvchi paneli bosh sahifasi: shaxsiy davomat, oxirgi 14 kun, bugungi kirish-chiqishlar va (sinf rahbari bo'lsa) sinf holati
const ViewerDashboard = () => <ViewerStatsProvider><Dashboard /></ViewerStatsProvider>

export default ViewerDashboard
