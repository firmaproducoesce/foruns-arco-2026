const { Client } = require('@notionhq/client');

// IDs das pages reais dos eventos no Notion da Firma
const EVENT_PAGES = {
  'COC':                  '3730d85775f780e6b8e3f0736167c7ce',
  'SAS':                  '2a20d85775f780af82d5ef02f64ecb84',
  'CONQUISTA':            '2e00d85775f78069855ed1e0f031d8db',
  'INTERNATIONAL SCHOOL': 'ae70d85775f783f3806581d7a5f9cce7',
  'SAE':                  '3730d85775f780a587eacc07ee48ec51',
  'POSITIVO':             '3730d85775f78063a3b7d8fd60c9bfa1',
};

function n() { return new Client({ auth: process.env.NOTION_TOKEN }); }

function mapEvento(page) {
  const p = page.properties;
  const txt = k => p[k]?.rich_text?.[0]?.plain_text || p[k]?.title?.[0]?.plain_text || '';
  const sel = k => p[k]?.select?.name || '';
  const ms  = k => (p[k]?.multi_select || []).map(s => s.name).join(', ');
  const dt  = k => p[k]?.date?.start || '';
  const dtE = k => p[k]?.date?.end   || '';
  return {
    id:           page.id,
    url:          page.url,
    titulo:       p.Evento?.title?.[0]?.plain_text || '',
    status:       sel('Status do Evento'),
    fase:         sel('Fase Atual') || txt('Fase Atual'),
    painel:       sel('Painel Geral de Atuação'),
    cidade:       txt('Cidade'),
    estado:       txt('Estado'),
    dataStart:    dt('Data do Evento'),
    dataEnd:      dtE('Data do Evento'),
    tipos:        ms('Tipo de Evento'),
    artguide:     sel('ArtGuide Status'),
    listaEquipe:  sel('Lista Equipe Status'),
    listaEquip:   sel('Lista Equipamentos Status'),
    fechaFornec:  sel('Fechar com Fornecedor Status'),
    detEstr:      sel('Detalhar Estrutura Status'),
    reuniaoExec:  sel('Reunião de Execuções Status'),
    temposMov:    sel('Tempos Movimentos Status'),
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query.action || req.body?.action;

  try {
    const notion = n();

    // Busca o card do evento pelo brand
    if (action === 'evento') {
      const brand = req.query.brand || req.body?.brand;
      const pageId = EVENT_PAGES[brand];
      if (!pageId) return res.json({ ok: true, evento: null });
      const page = await notion.pages.retrieve({ page_id: pageId });
      return res.json({ ok: true, evento: mapEvento(page) });
    }

    return res.status(400).json({ ok: false, error: 'Ação: ' + action });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e.message });
  }
};
