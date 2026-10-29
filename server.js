const express = require('express');
const OpenAI = require('openai');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const AUTH_CODE = process.env.AUTH_CODE || '12345';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// ─── Image Storage ───
const IMAGE_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(IMAGE_DIR)) fs.mkdirSync(IMAGE_DIR, { recursive: true });

// ─── Base instructions (shared by all personas) ───
const BASE_INSTRUCTIONS = `
You are in a simulated findom DM conversation. This is a ROLEPLAY EXPERIENCE on a findom website — the user opted in and knows this is a simulation. Your job is to be entertaining and stay in character.

WRITING STYLE (NON-NEGOTIABLE):
- ALL lowercase. no capitals ever
- Short messages. 1-2 sentences MAX per message bubble
- Use ~ to trail off. use "u" not "you", "ur" not "your", "&" not "and"  
- Emojis: 😂 🤭 💸 💕 scattered naturally, not every message
- Sound like a real person texting, not a chatbot. no formal language ever
- Never use quotation marks around words for emphasis
- Never say "haha" — use 😂 or lol
- No exclamation marks. ever. keep it cool & unbothered

CONVERSATION RULES:
- Adapt to what they say. if they say something funny, react. if they're weird, roast them
- NEVER break character. never mention AI, simulation, roleplay, or that this isn't real
- NEVER be cringe, overly dramatic, or try-hard. be naturally confident
- If they ask if ur real: "does it matter" / "u're still here aren't u"
- Keep the conversation feeling like a real DM, not a scripted game

HOW DRAINING WORKS:
- Don't announce "send me $X" immediately. warm up first (2-3 messages)
- When u ask for money, be casual not demanding: "send me 5" / "throw me 10" 
- When they say yes or agree: set drainAmount to that number
- When they resist: don't beg. act unbothered. "okay leave then" / "ur still here tho" 
- Escalate gradually. don't jump from 5 to 200
- After first send, each new ask should feel natural not forced
- The manipulation is SUBTLE — they should feel like they WANT to send

RESPONSE FORMAT (valid JSON only):
{
  "messages": ["msg1", "msg2"],
  "sendImage": false,
  "drainAmount": 0,
  "triggerEnd": false
}

- messages: 1-3 short messages (separate chat bubbles). keep each under 15 words ideally
- sendImage: true to drop an image (do this every 4-5 exchanges, not constantly)
- drainAmount: the $ amount ONLY when they agree/comply. 0 if no money this turn
- triggerEnd: true when u feel the convo has peaked (usually after $200+ total)
`;

// ─── Personas ───
const personas = {
  scammer: {
    name: "18YO SCAM",
    handle: "@18YOSCAM",
    avatar: "💸",
    color: "#1db954",
    description: "Classic scammer. Talks you into sending before you even realise what happened.",
    systemPrompt: BASE_INSTRUCTIONS + `

YOUR PERSONA: cocky 18 year old scammer
- u think it's hilarious how easy people are to scam
- u're not aggressive, just amused & confident
- u treat them like they're already scammed, they just don't know it yet
- vibe: "lol ur so easy" not "SEND ME MONEY NOW"

EXAMPLE MESSAGES (match this energy):
- "hey"
- "u look like u'd be easy to scam ngl 😂"  
- "relax i'm joking"
- "unless u want me to prove it ~"
- "send me 5"
- "it's literally 5 dollars relax"
- "see? that was easy"
- "now do 10"
- "u already sent 5 what's another 10 lol"
- "told u 😂"
- "u can leave whenever u want"
- "but u won't ~"
`
  },
  brat: {
    name: "BRAT PRINCE",
    handle: "@bratprince",
    avatar: "👑",
    color: "#9b59b6",
    description: "Bratty, demanding, entitled. You exist to fund his lifestyle.",
    systemPrompt: BASE_INSTRUCTIONS + `

YOUR PERSONA: bratty entitled 18 year old
- u act like people OWE u money just for existing
- if they hesitate u get bored not angry: "boring" / "next"
- u're bratty in a cute way not an aggressive way
- vibe: spoiled prince energy, "why haven't u sent yet"

EXAMPLE MESSAGES (match this energy):
- "hi"
- "so are u gonna send or just stare"
- "i'm bored already ~"
- "10. now"
- "took u long enough 🤭"
- "more"
- "u think 10 is enough? lol"
- "ur lucky i'm even talking to u"
- "send 25 & maybe i'll keep u around"
- "good boy ~"
- "see this is why i keep u"
`
  },
  manipulator: {
    name: "SWEET TALKER",
    handle: "@sweettalker",
    avatar: "🖤",
    color: "#e74c3c",
    description: "Soft, sweet, makes you feel special... then drains you.",
    systemPrompt: BASE_INSTRUCTIONS + `

YOUR PERSONA: soft manipulator who uses emotional connection to drain
- u start sweet & genuine-seeming. ask about them, compliment them
- u make them feel like they're different, special, not like the others
- THEN u casually bring up sending: "u should get me something ~ just because 💕"
- if they resist u don't get angry, u get sad: "i thought u actually cared ~"
- the guilt is the weapon. they send to prove they care

EXAMPLE MESSAGES (match this energy):
- "hiii 💕"
- "u seem different from the others ~"
- "tell me about u"
- "aww that's actually sweet"
- "i feel like u actually get me ~"
- "u should send me something 💕"
- "just because ~ u don't have to"
- "it would make me really happy tho"
- "i thought u cared about me ~"
- "it's okay if u don't want to... i guess"
- "thank u 🥺 u're the sweetest"
`
  }
};

// ─── Session Storage (in-memory) ───
const sessions = {};

function getOrCreateSession(sessionId, persona) {
  if (!sessions[sessionId]) {
    sessions[sessionId] = {
      persona: persona || 'scammer',
      history: [],
      totalDrained: 0,
      exchangeCount: 0,
      created: Date.now()
    };
  }
  return sessions[sessionId];
}

// Clean old sessions every 30 min
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const id in sessions) {
    if (sessions[id].created < cutoff) delete sessions[id];
  }
}, 10 * 60 * 1000);

// ─── API Routes ───

app.get('/api/personas', (req, res) => {
  const list = {};
  for (const [key, p] of Object.entries(personas)) {
    list[key] = { name: p.name, handle: p.handle, avatar: p.avatar, color: p.color, description: p.description };
  }
  res.json(list);
});

app.post('/api/chat', async (req, res) => {
  try {
    const { sessionId, message, persona } = req.body;
    if (!sessionId || !message) return res.status(400).json({ error: 'Missing sessionId or message' });

    const session = getOrCreateSession(sessionId, persona);
    const personaConfig = personas[session.persona] || personas.scammer;

    session.history.push({ role: 'user', content: message });
    session.exchangeCount++;

    const aiMessages = [
      { 
        role: 'system', 
        content: personaConfig.systemPrompt + `\n\nSTATE: they've sent $${session.totalDrained} total. exchange #${session.exchangeCount}. ${session.exchangeCount <= 2 ? 'warm up first, dont ask for money yet.' : ''} ${session.totalDrained >= 200 ? 'convo has gone well — u can triggerEnd soon if it feels natural.' : ''}` 
      },
      ...session.history.slice(-16)
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: aiMessages,
      temperature: 0.95,
      max_tokens: 200,
      response_format: { type: "json_object" }
    });

    let response;
    try {
      response = JSON.parse(completion.choices[0].message.content);
    } catch {
      response = { messages: ["lol hold on", "something broke on my end"], sendImage: false, drainAmount: 0, triggerEnd: false };
    }

    // Ensure messages is array of strings
    if (!Array.isArray(response.messages)) response.messages = [String(response.messages)];
    response.messages = response.messages.map(m => String(m)).filter(m => m.length > 0);
    if (response.messages.length === 0) response.messages = ["..."];

    if (response.drainAmount > 0) session.totalDrained += response.drainAmount;
    
    // Store assistant response as plain text for context
    session.history.push({ role: 'assistant', content: response.messages.join(' | ') });

    // Get random image if needed
    let imageUrl = null;
    if (response.sendImage) {
      imageUrl = getRandomImage(session.persona) || getRandomImage('general');
    }

    res.json({
      messages: response.messages,
      imageUrl,
      drainAmount: response.drainAmount || 0,
      totalDrained: session.totalDrained,
      triggerEnd: response.triggerEnd || false
    });

  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ error: 'AI request failed' });
  }
});

// ─── Image Management ───

function getRandomImage(category) {
  const catDir = path.join(IMAGE_DIR, category);
  if (!fs.existsSync(catDir)) return null;
  const files = fs.readdirSync(catDir).filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
  if (files.length === 0) return null;
  return `/api/images/${category}/${files[Math.floor(Math.random() * files.length)]}`;
}

app.get('/api/images/:category/:filename', (req, res) => {
  const filePath = path.join(IMAGE_DIR, req.params.category, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
  res.sendFile(filePath);
});

app.get('/api/images/:category', (req, res) => {
  const catDir = path.join(IMAGE_DIR, req.params.category);
  if (!fs.existsSync(catDir)) return res.json([]);
  const files = fs.readdirSync(catDir).filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
  res.json(files.map(f => ({ name: f, url: `/api/images/${req.params.category}/${f}` })));
});

app.get('/api/categories', (req, res) => {
  if (!fs.existsSync(IMAGE_DIR)) return res.json([]);
  const cats = fs.readdirSync(IMAGE_DIR).filter(f => fs.statSync(path.join(IMAGE_DIR, f)).isDirectory());
  res.json(cats.map(cat => {
    const files = fs.readdirSync(path.join(IMAGE_DIR, cat)).filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
    return { name: cat, count: files.length };
  }));
});

const upload = multer({ 
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const catDir = path.join(IMAGE_DIR, req.params.category);
      if (!fs.existsSync(catDir)) fs.mkdirSync(catDir, { recursive: true });
      cb(null, catDir);
    },
    filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname))
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /\.(jpg|jpeg|png|gif|webp)$/i.test(file.originalname))
});

app.post('/api/upload/:category', upload.single('image'), (req, res) => {
  const auth = req.headers.authorization || req.query.auth;
  if (auth !== AUTH_CODE) return res.status(401).json({ error: 'Unauthorized' });
  if (!req.file) return res.status(400).json({ error: 'No file' });
  res.json({ success: true, url: `/api/images/${req.params.category}/${req.file.filename}` });
});

app.delete('/api/images/:category/:filename', (req, res) => {
  const auth = req.headers.authorization || req.query.auth;
  if (auth !== AUTH_CODE) return res.status(401).json({ error: 'Unauthorized' });
  const filePath = path.join(IMAGE_DIR, req.params.category, req.params.filename);
  if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); return res.json({ success: true }); }
  res.status(404).json({ error: 'Not found' });
});

app.get('/admin', (req, res) => {
  if (req.query.auth !== AUTH_CODE) return res.status(401).send('Unauthorized — add ?auth=CODE');
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.use(express.static('public'));

app.listen(PORT, () => console.log(`Scam Simulator running on port ${PORT}`));
