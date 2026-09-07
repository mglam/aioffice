import type { ArtifactType, Phase } from '../types';
import type { Dict } from './index';

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * Spanish (rioplatense) UI strings — the wording the app originally shipped with.
 *
 * Typed as `Dict`, so leaving a key out is a compile error rather than a blank label.
 */
export const es: Dict = {
  common: {
    cancel: 'Cancelar',
    save: 'Guardar',
    saving: 'Guardando…',
    close: 'Cerrar',
    edit: 'Editar',
    delete: 'Borrar',
    deleting: 'Borrando…',
    opening: 'Abriendo…',
    copy: 'Copiar',
    loading: 'cargando…',
    name: 'Nombre',
  },

  app: {
    project: 'Proyecto',
    noProjects: 'sin proyectos',
    manageProjects: 'Gestionar proyectos',
    people: 'Personas',
    language: 'Idioma',
    turnsAndCost: (turns, cost) => `${turns} ${plural(turns, 'turno', 'turnos')} · $${cost}`,
  },

  nav: {
    conversationsEyebrow: 'Conversaciones',
    needsProject: 'Primero agregá un proyecto',
    newConversation: '+ Nueva conversación',
  },

  center: {
    pickConversation: 'Elegí una conversación',
    noConversations: 'Todavía no hay conversaciones',
    pickConversationBody: 'O abrí una nueva sobre otro tema, con la misma gente.',
    noConversationsBody:
      'Abrí una: un tema, una pregunta a responder, y la gente que quieras que opine.',
  },

  transcript: {
    moderator: 'Moderador',
    phase: { open: 'abriendo', cross: 'cruzando', close: 'cerrando' } as Record<Phase, string>,
    allOfTheirs: 'todos los suyos',
    closed: 'cerró',
    hasFloor: 'tiene la palabra',
    thinking: 'trabajando — todavía no escribió nada',
    newTurns: (n) => `${n} ${plural(n, 'turno nuevo', 'turnos nuevos')}`,
    toEnd: 'Ir al final',
    emptyTitle: (title) => `Todavía no se dijo nada en «${title}»`,
    emptyBody:
      'Elegí un modo, escribí qué querés que respondan, y dale Play. Habla quien esté marcado a '
      + 'la derecha.',
  },

  chair: {
    modeLabel: 'Cómo corre',
    modeAnswer: 'Responder una pregunta',
    modeSweep: 'Una ronda, todos a la vez',
    modeDeliver: 'Llegar a los entregables',
    play: 'Play',
    playTitle: 'Correlo. Lo que haya en el cuadro entra antes como tu mensaje.',
    playBlocked: 'Marcá al menos un asiento a la derecha — dos, salvo que sea una sola ronda. '
      + 'Los modos con pregunta necesitan una: escribila en el cuadro.',
    placeholder:
      'La pregunta a responder. Play la manda — o ⌘↵ / Ctrl↵. Dejalo vacío para seguir con la que '
      + 'ya está; en medio de una ronda, lo que escribas los redirige.',
    stop: 'Parar',
    stopping: 'Frenando…',
    hintStopping:
      'Frenando. El turno en curso se corta y queda en el acta lo que alcanzó a decir.',
    hintWriting: (what) => `La mesa cerró. Escribiendo ${what}…`,
    hintPhase: (phase, round, rounds) => `${phase} — vuelta ${round} de ${rounds}.`,
    hintAuto:
      'La mesa está hablando sola. Podés frenarla: lo ya dicho queda en el acta.',
    hintIdle:
      'Habla quien esté marcado a la derecha — uno solo es un único turno. ⌘↵ arranca.',
    hintDeliver:
      'Sin pregunta: trabajan hasta cerrar y después escriben lo que esté marcado en Entregables. '
      + 'Desmarcá todo y no escribe nada.',
    hintNoQuestion:
      'Esta conversación no tiene pregunta, así que sólo puede charlar. Definila a la derecha.',
    writeFailed: (what, message) => `No se pudo escribir «${what}»: ${message}`,
  },

  open: {
    didNotClose: (blockers, notClosed) =>
      `La mesa no cerró: ${blockers} ${plural(blockers, 'bloqueo', 'bloqueos')} en pie`
      + (notClosed.length ? ` y sin cerrar ${notClosed.join(', ')}` : '')
      + '. No escribí nada.',
    carryOn: 'Seguir la mesa',
    writeAnyway: 'Escribir igual',
    writeAnywayTitle: 'Los documentos van a abrir declarando qué quedó abierto.',
  },

  convActions: {
    copy: 'Copiar',
    copyTitle:
      'Abre la misma conversación otra vez — la misma gente en los mismos niveles, la misma '
      + 'pregunta, los mismos entregables, sin nada dicho. Esta se conserva. Cambiá la pregunta '
      + 'en la barra y dale Play.',
    reset: 'Reiniciar',
    resetTitle:
      'Vacía esta conversación y le deja la configuración. Lo que ya publicaste en tu repo no se '
      + 'toca.',
    resetWarn: (turns) =>
      `¿Vaciar esta conversación? Se van sus ${turns} `
      + `${turns === 1 ? 'turno' : 'turnos'} y los borradores que tenga, y no se recuperan. La `
      + 'gente, la pregunta y los entregables quedan. Los documentos ya publicados en tu repo no '
      + 'se tocan.',
  },

  context: {
    eyebrow: 'Contexto',
    noBrief: 'sin contexto — clic para escribirlo',
    editBrief: 'Editar contexto',
    briefPlaceholder: 'Qué hay que saber antes de opinar sobre este tema.',
  },

  seatPicker: {
    title: 'Sentar a alguien',
    lede:
      'Recibe todo lo dicho hasta ahora en su primer turno, así que una conversación ya empezada '
      + 'es un buen lugar para sumar a alguien.',
    global: 'global',
    forProject: 'de este proyecto',
    fromRepo: 'del repo',
    builtin: 'base',
    chars: (n) => `prompt de ${(n / 1000).toFixed(1)}k`,
    submit: (n) => (n === 1 ? 'Sentar 1' : `Sentar ${n}`),
  },

  seats: {
    eyebrow: 'Participantes',
    add: '+ sentar',
    addTitle: 'Sentar a alguien más en esta conversación. Recibe todo lo dicho hasta ahora en su '
      + 'primer turno.',
    everyone: 'Ya están sentados todos los disponibles.',
    chairSet: (who) => `Que ${who} conduzca esta conversación`,
    chairClear: 'Conduce esta conversación. Clic para dejarla abierta.',
    chairNeedsIn: 'No participa, así que no puede conducir. Primero sumalo.',
    levelChairFloor:
      'El que conduce tiene que participar, así que este no se puede apagar — primero mové la '
      + 'estrella. Clic para: respuestas cortas y concretas.',
    gone: 'ya no existe en .claude/agents/',
    level: {
      off: 'no participa',
      low: 'participa con respuestas cortas y concretas',
      medium: 'da una respuesta completa',
      high: 'hace un análisis detallado de la respuesta',
    } as Record<string, string>,
    levelLabel: (who, now) => `${who}: ${now}`,
    levelTitle: (now, next) => `${now}. Clic para: ${next}.`,
    speaking: 'habla ahora',
    noAgents:
      'Este proyecto todavía no tiene a nadie propio — sólo claude-code. Agregá alguien desde '
      + 'Personas, arriba.',
  },

  deliverables: {
    eyebrow: 'Entregables',
    openDoc: 'Abrir el documento',
    published: 'publicado',
    draft: 'borrador',
    notClosed: 'sin cerrar',
    types: {
      plan: { title: 'Plan de trabajo', note: 'alcance, fases, verificación' },
      requirements: { title: 'Requerimientos', note: 'problema, restricciones, criterios' },
      proposal: { title: 'Propuesta comercial', note: 'qué se entrega, qué no se promete' },
      review: { title: 'Revisión de lo que hay', note: 'qué está bien, qué falta, en qué orden' },
      decisions: { title: 'Acuerdos', note: 'decidido, abierto, desacuerdos' },
    } as Record<ArtifactType, { title: string; note: string }>,
  },

  archetypes: {
    'pm': { label: 'Product manager', note: 'Qué construir, en qué orden, y qué no construir' },
    'sales': { label: 'Vendedor', note: 'Qué se puede mostrar, qué prometer, y qué no' },
    'customer-business': { label: 'Cliente — quien decide', note: 'Compra el resultado, no la feature' },
    'customer-technical': { label: 'Cliente — su técnico', note: 'Lo tiene que operar, y ve la promesa que no va a sobrevivir' },
    'software-architect': { label: 'Arquitecto de software', note: 'Dónde vive cada cosa, y por qué' },
    'domain-specialist': { label: 'Especialista del dominio', note: 'La tecnología o industria de la que trata el producto' },
    'developer': { label: 'Programador', note: 'Qué cuesta construirlo de verdad, en este código' },
    'facilitator': { label: 'Facilitador', note: 'Nota cuando la discusión se fue por las ramas, y lo dice' },
  } as Record<string, { label: string; note: string }>,

  conversations: {
    rename: 'Renombrar esta conversación',
    pickToDelete: 'Borrar una conversación…',
    pickCancel: 'Dejalo',
    pickNote: 'Elegí cuál borrar.',
    deleteTitle: (title) => `Borrar «${title}»`,
    deleteWarn: (title, turns) =>
      `¿Borrar «${title}»? Se va con su acta de ${turns} `
      + `${turns === 1 ? 'turno' : 'turnos'} y los borradores que tenga. Los documentos ya `
      + 'publicados en el proyecto no se tocan.',
  },

  setup: {
    titleNew: 'Agregar un proyecto',
    titleEdit: (name) => `Configurar ${name}`,
    steps: 'Pasos de configuración',
    stepFolder: 'Carpeta',
    stepIdentity: 'Identidad',
    back: 'Atrás',
    next: 'Siguiente',
    checking: 'verificando…',
    refresh: 'IA',
    refreshTitle: 'Volver a leer el repo y refrescar nombre, idioma y marco (~$0.10)',
    refreshBusy: 'Leyendo el repo…',
    readingRepo: 'Bloqueado mientras lee: lo que devuelva reemplaza estos campos.',
    pending: 'Cambios sin guardar.',
    changed: 'cambió',
    discardChanges: 'Descartar cambios',
    saveChanges: 'Guardar cambios',
    notAProject:
      'Esto no parece la raíz de un proyecto — no tiene CLAUDE.md, README, repo git ni manifiesto. '
      + 'Elegí una carpeta de proyecto, o entrá en esta.',
    noClaudeMd: 'Sin CLAUDE.md, así que el marco se redacta desde el README.',
    createAndGo: 'Crear el proyecto',
    created: (name) =>
      `«${name}» ya existe. Las personas que se van a sentar en sus mesas se agregan desde el `
      + 'botón Personas del encabezado; el engranaje al lado del selector vuelve a abrir esto.',
    done: 'Listo',
    nameNote: 'Por default el nombre de la carpeta. Es sólo para que lo reconozcas vos.',
    spent: (usd) => `Gastado hasta acá: $${usd}`,
    read: 'Leer',
    hide: 'Ocultar',
    regenerate: 'Regenerar',
    discard: 'Borrar',
  },

  people: {
    title: 'Personas',
    lede:
      'Cualquiera de estas se puede sentar en la mesa de cualquier proyecto. Una persona es un '
      + 'profesional, no un artefacto del proyecto: qué es el producto le llega cuando se sienta, '
      + 'así que el mismo especialista juzga una cosa hoy y otra el mes que viene. Están escritas '
      + 'en inglés, y responden en el idioma del proyecto donde se sientan.',
    add: '+ Nueva persona',
    /** Encabezado del formulario, donde el `+` del botón quedaría mal. */
    addTitle: 'Nueva persona',
    role: 'Rol',
    editTitle: (id) => `Editar ${id}`,
    editTitleShort: 'Cambiar con qué se escribió, y volver a escribirla',
    anyOption: 'que lo decida Claude',
    anyText: 'dejalo vacío y lo decide Claude',
    addNote:
      'Las opciones son lo que hace distintas a dos personas del mismo rol. Unos $0.20.',
    editNote:
      'El mismo rol, y las opciones con las que se escribió. Generar reemplaza su texto — las '
      + 'actas donde ya aparece no se tocan. Unos $0.20.',
    generate: 'Generar',
    writing: 'escribiendo…',
    writingNote: 'Escribiendo la persona. Tarda un minuto; podés seguir trabajando.',
    scope: 'Para quién trabaja',
    scopeGlobal: 'Cualquier proyecto',
    scopeProject: (name) => `Sólo ${name}`,
    scopedNote:
      'Sólo se ofrece en ese proyecto, y se lee su repo al escribirla — así un rol de adentro '
      + 'aprende qué hace la cosa y con qué palabras su equipo nombra sus propios conceptos, y '
      + 'cualquier rol resuelve sus blancos con algo real en lugar de adivinado. Nunca una lista '
      + 'de features ni un identificador interno: eso envejece. Suma unos centavos y medio '
      + 'minuto.',
    globals: 'Globales',
    globalsNote:
      'Las personas cuya utilidad es su oficio y no tu producto: un vendedor (vender es vender), '
      + 'un especialista de dominio, un facilitador. Lo que saben viaja — un especialista IP vale '
      + 'sentarlo en todos los proyectos que toquen una red.',
    forProject: (name) => `Escritas para ${name}`,
    forProjectNote:
      'Las personas que sólo significan algo contra un producto concreto: su product manager, los '
      + 'clientes que lo comprarían y el técnico que tendría que operarlo, su arquitecto y sus '
      + 'desarrolladores. Un product manager en general no es nadie, y un cliente potencial '
      + 'siempre es cliente de algo.',
    inherited: 'Heredadas del repo',
    noneInherited: 'Este repo no tiene .claude/agents/ propio.',
    nameThem: 'Ponerles nombre',
    nameThemTitle:
      'Algunos se titulan por el rol, y a «el product manager» no se lo puede llamar. Le inventa '
      + 'un nombre al que no tenga (~$0.02), lo guarda acá — nunca en tu repo — y se lo dice en '
      + 'cada turno. Al que ya tiene nombre no lo toca.',
    naming: 'Poniéndoles nombre…',
    named: 'nombrado acá',
    inheritedNote:
      'Los .md que están en el .claude/agents/ del proyecto. Son tuyos, y tu propio Claude Code '
      + 'también los ve ahí — así que la app los lee del disco, los sienta como a cualquiera, y '
      + 'nunca los escribe, edita ni borra. Un id de acá le gana a uno propio de la app.',
    none: 'Todavía no hay ninguna. Agregá la primera.',
    deleteWarn: (id) =>
      `¿Borrar «${id}»? Las mesas donde participó conservan el acta, pero no puede volver a `
      + 'hablar salvo que escribas a alguien nuevo.',
  },

  /** Etiquetas y valores de las opciones, que en los arquetipos están en inglés. */
  knobs: {
    // pm
    'Where they default when evidence is thin': 'A qué se inclina cuando falta evidencia',
    'evidence-first': 'evidencia primero',
    'ship-to-learn': 'sacar para aprender',
    'platform': 'plataforma',
    'How far out they plan': 'Con qué horizonte planifica',
    'next-cut': 'el próximo corte',
    'quarter': 'el trimestre',
    'year': 'el año',
    // sales
    'Who they work for': 'Para quién trabaja',
    'the maker': 'el fabricante',
    'a partner or reseller': 'un partner o revendedor',
    'Partner or channel name, if any': 'Nombre del partner o canal, si hay',
    'How they sell': 'Cómo vende',
    'closing-driven': 'orientado al cierre',
    'consultative': 'consultivo',
    'customer-centric': 'customer centric',
    'technical-presales': 'preventa técnica',
    // customers
    'How they arrive': 'Con qué actitud llega',
    'sceptical': 'escéptico',
    'keen but unfunded': 'entusiasmado pero sin presupuesto',
    'demanding': 'exigente',
    'burned by a previous vendor': 'quemado por un proveedor anterior',
    'an internal ally': 'aliado interno',
    'overloaded': 'desbordado',
    'territorial': 'territorial',
    'How buying decisions get made': 'Cómo se decide una compra',
    'the owner decides': 'decide el dueño',
    'a committee': 'un comité',
    'procurement': 'compras',
    'What their environment is like': 'Cómo es su entorno',
    'mature and monitored': 'madura y monitoreada',
    'manual and spreadsheets': 'manual y con planillas',
    'heterogeneous with legacy': 'heterogénea y con legacy',
    // architect
    'What they optimise for': 'Qué prioriza',
    'conservative': 'conservador',
    'pragmatic': 'pragmático',
    'purist': 'purista',
    'What they worry about first': 'Qué le preocupa primero',
    'data and consistency': 'datos y consistencia',
    'operability': 'operabilidad',
    'cost of change': 'costo del cambio',
    // domain specialist
    'The field they know': 'El campo que conoce',
    'Specific technologies or vendors, if it matters': 'Tecnologías o proveedores, si importa',
    'Where their authority comes from': 'De dónde le viene la autoridad',
    'field-earned': 'de campo',
    'standards-led': 'desde los estándares',
    'design-led': 'desde el diseño',
    // developer
    'Which part of the stack': 'Qué parte del stack',
    'backend': 'backend',
    'frontend': 'frontend',
    'data': 'datos',
    'infrastructure': 'infraestructura',
    'How they work': 'Cómo trabaja',
    'test-rigorous': 'riguroso con los tests',
    'refactor-first': 'refactor primero',
    // facilitator
    'How hard they push back': 'Cuánto aprieta',
    'gentle': 'suave',
    'cuts the drift': 'corta la deriva',
    'hospital scheduling, freight yard operations, card settlement, grid protection relays, warehouse robotics':
      'agenda hospitalaria, operación de playas de carga, settlement de tarjetas, protecciones de red '
      + 'eléctrica, robótica de depósito',
  } as Record<string, string>,

  doc: {
    publishedAt: (where) => `publicado en ${where}`,
    draftNote: 'borrador — todavía no está en el proyecto',
    writtenWithBlockers: (n) =>
      ` · escrito con ${n} ${plural(n, 'bloqueo', 'bloqueos')} en pie`,
    download: 'Descargar',
    downloadTitle: 'Guarda el markdown tal como está. Un borrador no toca tu repo hasta que lo '
      + 'publiques.',
    discard: 'Descartar',
    discardPublished: 'Borra el borrador. La copia publicada en el proyecto queda.',
    discardDraft: 'Borra el borrador. No se escribió nada en el proyecto.',
    publish: 'Publicar en el proyecto',
    publishing: 'Publicando…',
    alreadyPublished: 'Publicado',
    alreadyPublishedTitle: 'Ya está en el proyecto',
    publishTitle: (path) => `Copiar a ${path}/AISPECS/`,
  },

  newConversation: {
    title: 'Nueva conversación',
    lede: (project) => `Sobre ${project}.`,
    who: 'Quiénes se sientan',
    noParticipants:
      'Este proyecto todavía no tiene a nadie para sentar. Agregá alguien desde Personas, arriba.',
    whoNote:
      'Sólo estos hablan en esta conversación, y por default son los de la última. Podés sentar '
      + 'a más después, desde la conversación misma.',
    base: ' · base',
    topic: 'Tema',
    topicPlaceholder: 'El alcance del primer release',
    question: 'La pregunta que hay que responder',
    questionPlaceholder: '¿Qué mecanismos entran en el corte 1 y qué queda afuera?',
    questionNote:
      'Una conversación converge sobre una pregunta, no sobre un tema. Sin pregunta sólo puede '
      + 'charlar.',
    context: 'Contexto',
    contextPlaceholder:
      'Qué ya existe, qué se probó, qué restricciones hay. Lo lee cada participante en su primer '
      + 'turno.',
    deliverables: 'Qué tiene que salir de acá',
    how: 'Cómo se conversa',
    openMode: 'Abierta',
    openModeTitle: 'Cualquiera le pregunta a cualquiera.',
    chairedMode: 'Orquestada por…',
    chairedModeTitle: 'Uno pregunta y los demás contestan.',
    chairSelectLabel: 'Quién conduce esta conversación',
    chairedNote: (who) =>
      `${who} es el único que pregunta; los demás contestan y le devuelven el turno. Converge `
      + 'mucho mejor.',
    openNote: 'Cualquiera puede preguntarle a cualquiera. Más natural, pero cuesta más que cierre.',
    submit: 'Abrir la conversación',
  },

  projects: {
    title: 'Proyectos',
    lede: 'Un proyecto es un repo más un marco: qué es el producto que se está construyendo. '
      + 'Los participantes salen de su .claude/agents/.',
    none: 'Todavía no hay ninguno. Agregá el primero para empezar.',
    active: 'abierto',
    agents: (n) => `${n} ${plural(n, 'agente', 'agentes')}`,
    noAgents: 'todavía sin agentes',
    withFrame: 'con marco',
    noFrame: 'SIN MARCO',
    add: '+ Nuevo proyecto',
    repoPath: 'Ruta del repo',
    repoPathPlaceholder: 'Elegí una carpeta abajo, o pegá una ruta absoluta',
    pathAgents: (n) => `✓ ${n} ${plural(n, 'agente', 'agentes')} en .claude/agents/`,
    pathNoAgents: '✓ es un proyecto, todavía sin agentes — el paso 3 los puede generar',
    browseUp: 'Subir una carpeta',
    browseHere: 'elegida',
    browseEmpty: 'No hay subcarpetas acá.',
    browseHasAgents: 'agentes',
    browseNote: 'La carpeta en la que estás es la elegida — la ruta de arriba es la elección. Las '
      + 'filas grises no parecen un proyecto, pero podés entrar igual; › significa que hay uno '
      + 'más abajo.',
    browseAlsoBelow: 'También hay un proyecto más abajo',
    browseLeadsTo: 'No es un proyecto en sí, pero hay uno más abajo — entrá',
    browseNoProject: 'No es un proyecto, y no encontré ninguno abajo. Podés entrar igual.',
    frame: 'El marco del producto',
    frameNote:
      'Va para TODOS los participantes. Sin esto discuten el dominio en vez del producto: sus '
      + 'personas son de dominio y tu pregunta no alcanza para orientarlos.',
    framePlaceholder:
      'Qué es el producto y para quién, cómo está hecho a grandes rasgos, y qué se decide en '
      + 'estas mesas.',
    agentLanguage: 'Idioma de los agentes',
    agentLanguageNote:
      'El idioma en que están escritos el protocolo y las instrucciones de los entregables. '
      + 'Que coincida con el idioma de las personas en .claude/agents/ — una persona en español '
      + 'con un protocolo en inglés recibe un prompt mezclado. Es independiente del idioma de '
      + 'la interfaz.',
    setUp: 'Configurar',
    deleteTitle: (name) => `Borrar «${name}»`,
    deleteLede: 'Esto se va a llevar, de la app:',
    doomConversations: (n) =>
      `${n} ${plural(n, 'conversación', 'conversaciones')} con su acta completa`,
    doomArtifacts: (n) => `${n} ${plural(n, 'documento', 'documentos')} en borrador`,
    doomWarn: 'No se puede recuperar. No hay archivado ni papelera.',
    doomKept: (folder) =>
      `Lo que NO se toca: los documentos que ya publicaste en ${folder}/AISPECS/. Esos quedan y `
      + 'los borrás vos.',
    doomType: (name) => `Escribí ${name} para confirmar`,
    doomConfirm: 'Borrar todo',
  },
};
