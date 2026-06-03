const { Client } = require('@notionhq/client');

// Banco real: "Gerenciamento de Atividades" (Radar Operacional da Firma)
const RADAR_DB = '25d0d85775f78087b0beed6f8dab67d4';

// IDs dos cards de evento
const EVENT_PAGES = {
  'COC':                  '3730d85775f780e6b8e3f0736167c7ce',
  'SAS':                  '2a20d85775f780af82d5ef02f64ecb84',
  'CONQUISTA':            '2e00d85775f78069855ed1e0f031d8db',
  'INTERNATIONAL SCHOOL': 'ae70d85775f783f3806581d7a5f9cce7',
  'SAE':                  '3730d85775f780a587eacc07ee48ec51',
  'POSITIVO':             '3730d85775f78063a3b7d8fd60c9bfa1',
};

function n() { return new Client({ auth: process.env.NOTION_TOKEN }); }
function rt(t) { return t ? [{ text: { content: String(t) } }] : []; }

function mapEvento(page) {
  const p = page.properties;
  const txt = k => p[k]?.rich_text?.[0]?.plain_text || p[k]?.title?.[0]?.plain_text || '';
  const sel = k => p[k]?.select?.name || '';
  const ms  = k => (p[k]?.multi_select || []).map(s => s.name).join(', ');
  return {
    id:          page.id,
    url:         page.url,
    titulo:      p.Evento?.title?.[0]?.plain_text || '',
    status:      sel('Status do Evento'),
    fase:        sel('Fase Atual') || txt('Fase Atual'),
    painel:      sel('Painel Geral de Atuação'),
    cidade:      txt('Cidade'),
    estado:      txt('Estado'),
    dataStart:   p['Data do Evento']?.date?.start || '',
    dataEnd:     p['Data do Evento']?.date?.end   || '',
    tipos:       ms('Tipo de Evento'),
    artguide:    sel('ArtGuide Status'),
    listaEquipe: sel('Lista Equipe Status'),
    listaEquip:  sel('Lista Equipamentos Status'),
    fechaFornec: sel('Fechar com Fornecedor Status'),
    detEstr:     sel('Detalhar Estrutura Status'),
    reuniaoExec: sel('Reunião de Execuções Status'),
    temposMov:   sel('Tempos Movimentos Status'),
  };
}

function mapTask(page) {
  const p = page.properties;
  const ms = k => (p[k]?.multi_select || []).map(s => s.name);
  return {
    id:          page.id,
    url:         page.url,
    title:       p['Ação Operacional']?.title?.[0]?.plain_text || '',
    stage:       p['Funil Operacional']?.status?.name || 'Não iniciada',
    priority:    p.Prioridade?.select?.name || 'Média',
    dueDate:     p['Prazo de Conclusão']?.date?.start || '',
    areas:       ms('Área Responsável'),
    tags:        ms('Tags'),
    description: p['Detalhamento da Ação']?.rich_text?.[0]?.plain_text || '',
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query.action || req.body?.action;
  const notion = n();

  try {
    // GET event page info
    if (action === 'evento') {
      const brand = req.query.brand || req.body?.brand;
      const pid = EVENT_PAGES[brand];
      if (!pid) return res.json({ ok: true, evento: null });
      const page = await notion.pages.retrieve({ page_id: pid });
      return res.json({ ok: true, evento: mapEvento(page) });
    }

    // DEBUG: test raw query
    if (action === 'debug') {
      const brand = req.query.brand || req.body?.brand || 'COC';
      const pid = EVENT_PAGES[brand];
      try {
        const r = await notion.databases.query({ database_id: RADAR_DB, page_size: 3 });
        return res.json({ ok: true, brand, pid, db: RADAR_DB, count: r.results.length, first: r.results[0]?.id });
      } catch(e) {
        return res.json({ ok: false, error: e.message, code: e.code, db: RADAR_DB });
      }
    }

    // GET tasks from Radar Operacional filtered by event
    if (action === 'tasks') {
      const brand = req.query.brand || req.body?.brand;
      const pid = EVENT_PAGES[brand];
      if (!pid) return res.json({ ok: true, tasks: [] });
      const r = await notion.databases.query({
        database_id: RADAR_DB,
        filter: { property: 'Eventos', relation: { contains: pid } },
        sorts: [{ timestamp: 'created_time', direction: 'descending' }],
      });
      return res.json({ ok: true, tasks: r.results.map(mapTask) });
    }

    // CREATE task
    if (action === 'create-task') {
      const d = req.body;
      const pid = EVENT_PAGES[d.brand];
      if (!pid) return res.status(400).json({ ok: false, error: 'Marca inválida' });
      const props = {
        'Ação Operacional': { title: [{ text: { content: d.title } }] },
        'Funil Operacional': { status: { name: d.stage || 'Não iniciada' } },
        'Prioridade': { select: { name: d.priority || 'Média' } },
        'Eventos': { relation: [{ id: pid }] },
      };
      if (d.description) props['Detalhamento da Ação'] = { rich_text: rt(d.description) };
      if (d.dueDate)     props['Prazo de Conclusão']   = { date: { start: d.dueDate } };
      if (d.areas?.length) props['Área Responsável'] = { multi_select: d.areas.map(a => ({ name: a })) };
      if (d.tags?.length)  props['Tags'] = { multi_select: d.tags.map(t => ({ name: t })) };
      const page = await notion.pages.create({ parent: { database_id: RADAR_DB }, properties: props });
      return res.json({ ok: true, id: page.id });
    }

    // UPDATE stage (drag kanban)
    if (action === 'update-stage') {
      const { id, stage } = req.body;
      await notion.pages.update({ page_id: id, properties: { 'Funil Operacional': { status: { name: stage } } } });
      return res.json({ ok: true });
    }

    // UPDATE full task
    if (action === 'update-task') {
      const { id, title, stage, priority, description, dueDate, areas, tags } = req.body;
      const props = {};
      if (title)    props['Ação Operacional']   = { title: [{ text: { content: title } }] };
      if (stage)    props['Funil Operacional']  = { status: { name: stage } };
      if (priority) props['Prioridade']         = { select: { name: priority } };
      if (description !== undefined) props['Detalhamento da Ação'] = { rich_text: rt(description) };
      if (dueDate)  props['Prazo de Conclusão'] = { date: { start: dueDate } };
      if (areas)    props['Área Responsável']   = { multi_select: areas.map(a => ({ name: a })) };
      if (tags)     props['Tags']               = { multi_select: tags.map(t => ({ name: t })) };
      await notion.pages.update({ page_id: id, properties: props });
      return res.json({ ok: true });
    }

    // DELETE task
    if (action === 'delete-task') {
      await notion.pages.update({ page_id: req.body.id, archived: true });
      return res.json({ ok: true });
    }

    return res.status(400).json({ ok: false, error: 'Ação desconhecida: ' + action });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e.message });
  }
};
