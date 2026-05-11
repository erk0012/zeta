const { Telegraf } = require('telegraf')
const mongoose = require('mongoose')

const CATEGORIES = [
  'Alimentação', 'Transporte', 'Moradia', 'Saúde',
  'Educação', 'Lazer', 'Compras', 'Assinaturas',
  'Salário', 'Investimentos', 'Outros'
]

const expenseSchema = new mongoose.Schema({
  userId: Number,
  amount: Number,
  category: String,
  description: String,
  date: { type: Date, default: Date.now }
})

const Expense = mongoose.model('Expense', expenseSchema)

async function connectDB() {
  await mongoose.connect(process.env.MONGODB_URI)
  console.log('MongoDB conectado')
}

const bot = new Telegraf(process.env.BOT_TOKEN)

bot.start((ctx) => {
  ctx.reply(
    `👋 Olá! Eu sou seu bot de controle de gastos.\n\n` +
    `Comandos:\n` +
    `/add <valor> <categoria> <descrição>\n` +
    `/hoje - gastos de hoje\n` +
    `/mes [mês] [ano] - resumo do mês\n` +
    `/categorias - lista de categorias\n\n` +
    `Exemplo:\n` +
    `/add 25.50 Alimentação Almoço no restaurante\n\n` +
    `Categorias: ${CATEGORIES.join(', ')}`
  )
})

bot.help((ctx) => {
  ctx.reply(
    `/add <valor> <categoria> <descrição> - adicionar gasto\n` +
    `/hoje - listar gastos de hoje\n` +
    `/mes [mês] [ano] - resumo mensal\n` +
    `/categorias - ver categorias com totais`
  )
})

bot.command('add', async (ctx) => {
  const text = ctx.message.text.replace('/add', '').trim()
  if (!text) {
    return ctx.reply('Uso: /add <valor> <categoria> <descrição>\nExemplo: /add 25.50 Alimentação Almoço')
  }

  const parts = text.split(' ')
  const amount = parseFloat(parts[0])
  if (isNaN(amount) || amount <= 0) {
    return ctx.reply('Valor inválido. Use número positivo (ex: 25.50)')
  }

  const category = parts[1] || 'Outros'
  const description = parts.slice(2).join(' ') || category

  await Expense.create({
    userId: ctx.from.id,
    amount: Math.round(amount * 100) / 100,
    category,
    description
  })

  ctx.reply(
    `✅ Gasto registrado!\n\n` +
    `Valor: R$ ${amount.toFixed(2)}\n` +
    `Categoria: ${category}\n` +
    `Descrição: ${description}`
  )
})

bot.command('hoje', async (ctx) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const expenses = await Expense.find({
    userId: ctx.from.id,
    date: { $gte: today, $lt: tomorrow }
  })

  if (expenses.length === 0) {
    return ctx.reply('Nenhum gasto registrado hoje.')
  }

  const total = expenses.reduce((s, e) => s + e.amount, 0)
  const lines = expenses.map((e, i) =>
    `${i + 1}. R$ ${e.amount.toFixed(2)} - ${e.category} - ${e.description}`
  )

  ctx.reply(
    `📅 Gastos de hoje:\n\n${lines.join('\n')}\n\n` +
    `Total: R$ ${total.toFixed(2)}`
  )
})

bot.command('mes', async (ctx) => {
  const text = ctx.message.text.replace('/mes', '').trim()
  const now = new Date()
  let month = now.getMonth()
  let year = now.getFullYear()

  if (text) {
    const parts = text.split(' ')
    month = parseInt(parts[0]) - 1
    if (parts[1]) year = parseInt(parts[1])
    if (isNaN(month) || month < 0 || month > 11) {
      return ctx.reply('Mês inválido. Use 1-12.\nExemplo: /mes 05 2026')
    }
  }

  const start = new Date(year, month, 1)
  const end = new Date(year, month + 1, 1)

  const expenses = await Expense.find({
    userId: ctx.from.id,
    date: { $gte: start, $lt: end }
  })

  if (expenses.length === 0) {
    return ctx.reply(`Nenhum gasto em ${String(month + 1).padStart(2, '0')}/${year}.`)
  }

  const total = expenses.reduce((s, e) => s + e.amount, 0)
  const byCategory = {}
  for (const e of expenses) {
    byCategory[e.category] = (byCategory[e.category] || 0) + e.amount
  }

  const catLines = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, val]) => `${cat}: R$ ${val.toFixed(2)}`)

  ctx.reply(
    `📊 Resumo de ${String(month + 1).padStart(2, '0')}/${year}:\n\n` +
    `${catLines.join('\n')}\n\n` +
    `Total: R$ ${total.toFixed(2)}\n` +
    `Registros: ${expenses.length}`
  )
})

bot.command('categorias', async (ctx) => {
  const result = await Expense.aggregate([
    { $match: { userId: ctx.from.id } },
    { $group: { _id: '$category', total: { $sum: '$amount' } } },
    { $sort: { total: -1 } }
  ])

  if (result.length === 0) {
    return ctx.reply('Nenhum gasto registrado ainda.')
  }

  const lines = result.map(r => `${r._id}: R$ ${r.total.toFixed(2)}`)
  const total = result.reduce((s, r) => s + r.total, 0)

  ctx.reply(
    `📂 Todas as categorias:\n\n${lines.join('\n')}\n\n` +
    `Total geral: R$ ${total.toFixed(2)}`
  )
})

const http = require('http')
const PORT = process.env.PORT || 3000

http.createServer((req, res) => {
  res.writeHead(200)
  res.end('ok')
}).listen(PORT, async () => {
  console.log(`Servidor rodando na porta ${PORT}`)
  await connectDB()
  bot.launch()
  console.log('Bot rodando...')
})

process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
