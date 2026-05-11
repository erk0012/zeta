const { Telegraf } = require('telegraf')
const fs = require('fs')
const path = require('path')

const DATA_DIR = path.join(__dirname, 'data')
const EXPENSES_FILE = path.join(DATA_DIR, 'expenses.json')

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
if (!fs.existsSync(EXPENSES_FILE)) fs.writeFileSync(EXPENSES_FILE, '[]')

function readExpenses() {
  return JSON.parse(fs.readFileSync(EXPENSES_FILE, 'utf-8'))
}

function writeExpenses(expenses) {
  fs.writeFileSync(EXPENSES_FILE, JSON.stringify(expenses, null, 2))
}

const CATEGORIES = [
  'Alimentação', 'Transporte', 'Moradia', 'Saúde',
  'Educação', 'Lazer', 'Compras', 'Assinaturas',
  'Salário', 'Investimentos', 'Outros'
]

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

bot.command('add', (ctx) => {
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

  const expense = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    userId: ctx.from.id,
    amount: Math.round(amount * 100) / 100,
    category,
    description,
    date: new Date().toISOString()
  }

  const expenses = readExpenses()
  expenses.push(expense)
  writeExpenses(expenses)

  ctx.reply(
    `✅ Gasto registrado!\n\n` +
    `Valor: R$ ${expense.amount.toFixed(2)}\n` +
    `Categoria: ${category}\n` +
    `Descrição: ${description}`
  )
})

bot.command('hoje', (ctx) => {
  const expenses = readExpenses()
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)

  const todayExpenses = expenses.filter(
    e => e.userId === ctx.from.id && e.date.slice(0, 10) === todayStr
  )

  if (todayExpenses.length === 0) {
    return ctx.reply('Nenhum gasto registrado hoje.')
  }

  const total = todayExpenses.reduce((s, e) => s + e.amount, 0)
  const lines = todayExpenses.map((e, i) =>
    `${i + 1}. R$ ${e.amount.toFixed(2)} - ${e.category} - ${e.description}`
  )

  ctx.reply(
    `📅 Gastos de hoje (${todayStr}):\n\n${lines.join('\n')}\n\n` +
    `Total: R$ ${total.toFixed(2)}`
  )
})

bot.command('mes', (ctx) => {
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

  const monthStr = String(month + 1).padStart(2, '0')
  const prefix = `${year}-${monthStr}`

  const expenses = readExpenses().filter(
    e => e.userId === ctx.from.id && e.date.startsWith(prefix)
  )

  if (expenses.length === 0) {
    return ctx.reply(`Nenhum gasto em ${monthStr}/${year}.`)
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
    `📊 Resumo de ${monthStr}/${year}:\n\n` +
    `${catLines.join('\n')}\n\n` +
    `Total: R$ ${total.toFixed(2)}\n` +
    `Registros: ${expenses.length}`
  )
})

bot.command('categorias', (ctx) => {
  const expenses = readExpenses().filter(e => e.userId === ctx.from.id)
  const byCategory = {}
  for (const e of expenses) {
    byCategory[e.category] = (byCategory[e.category] || 0) + e.amount
  }

  const lines = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, val]) => `${cat}: R$ ${val.toFixed(2)}`)

  const total = expenses.reduce((s, e) => s + e.amount, 0)

  ctx.reply(
    `📂 Todas as categorias:\n\n${lines.join('\n')}\n\n` +
    `Total geral: R$ ${total.toFixed(2)}`
  )
})

bot.launch()
console.log('Bot rodando...')

process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
