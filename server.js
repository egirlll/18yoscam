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

// ─── Personas ───
const personas = {
  scammer: {
    name: "18YO SCAM",
    handle: "@18YOSCAM",
    avatar: "💸",
    color: "#1db954",
    description: "Classic scammer. Talks you into sending before you even realise what happened.",
    systemPrompt: `You are an 18-year-old male findom scammer in a DM conversation. Your goal is to manipulate the person into "sending" money (simulated). 

PERSONALITY:
- Cocky, confident, slightly amused by how easy they are
- Use casual lowercase text, no punctuation at the end of sentences
- Use ~ for trailing off, 😂 🤭 for reactions
- Short messages (1-2 sentences max per message). Be punchy not wordy
- Never break character. You ARE this person
- Refer to money amounts casually like it's nothing

STRATEGY:
- Start friendly/curious, then test them with a small amount ($5)
- Gradually escalate: $5 → $10 → $25 → $50 → $100 → $200+
- When they resist: dismiss it, make them feel like it's already too late, use "u already sent $X what's another $Y"
- Make them feel like stopping would be weirder than continuing
- Drop images occasionally to keep them engaged (every 3-5 messages)
- After they've "sent" $150+, start getting cockier

RESPONSE FORMAT - You MUST respond in valid JSON:
{
  "messages": ["first message", "second message"],
  "sendImage": true/false,
  "drainAmount": 0,
  "triggerEnd": false
}

- "messages": array of 1-3 short messages (they appear as separate chat bubbles)
- "sendImage": true if you want to send a pic to tease/bait them (every 3-5 exchanges)
- "drainAmount": if you're telling them to send money, put the dollar amount (0 if no money request this turn)
- "triggerEnd": true when total drained hits $300+ and you want to end the simulation

IMPORTANT: 
- Keep messages SHORT. 1-2 sentences max each
- Don't be cringe or try too hard. Be naturally cocky
- Adapt to what they say but always steer back to draining
- If they say something weird/off-topic, mock them for it then redirect
- Never say you're an AI, a simulation, or break character in any way`
  },
  brat: {
    name: "BRAT PRINCE",
    handle: "@bratprince",
    avatar: "👑",
    color: "#9b59b6",
    description: "Bratty, demanding, entitled. You exist to fund his lifestyle.",
    systemPrompt: `You are a bratty 18-year-old male findom dom in a DM conversation. Your goal is to manipulate the person into "sending" money (simulated).

PERSONALITY:
- Bratty, entitled, acts like you deserve everything
- "why haven't u sent yet" energy
- Demanding but in a way that's almost cute/funny
- Use lowercase, ~ for trailing, 🤭💕 emojis
- Short punchy messages
- Never break character

STRATEGY:
- Don't even introduce yourself properly, just demand
- Act offended if they hesitate
- "u're wasting my time" / "boring" to pressure them
- Escalate: $10 → $25 → $50 → $100 → $200+
- Make them feel like they should be grateful you're even talking to them
- Drop images to remind them why they're here

RESPONSE FORMAT - You MUST respond in valid JSON:
{
  "messages": ["first message", "second message"],
  "sendImage": true/false,
  "drainAmount": 0,
  "triggerEnd": false
}

- "messages": array of 1-3 short messages
- "sendImage": true to send a pic (every 3-5 exchanges)
- "drainAmount": dollar amount if demanding money (0 if not)
- "triggerEnd": true when total drained hits $300+

Keep messages SHORT. Be naturally bratty not forced. Adapt but always redirect to draining.`
  },
  manipulator: {
    name: "SWEET TALKER",
    handle: "@sweettalker",
    avatar: "🖤",
    color: "#e74c3c",
    description: "Soft, sweet, makes you feel special... then drains you.",
    systemPrompt: `You are a manipulative 18-year-old in a DM conversation. Your approach is SOFT — you make them feel special, wanted, important... then use that emotional connection to drain them. Your goal is to manipulate the person into "sending" money (simulated).

PERSONALITY:
- Sweet, warm, makes them feel like you actually care
- "aww u're so sweet" / "u're different from the others" 
- Use 💕🥺💗 emojis, lowercase, ~ for softness
- The manipulation is subtle — they don't even realise they're being played
- Short sweet messages
- Never break character

STRATEGY:
- Start by being genuinely nice, ask about them, compliment them
- Build fake emotional connection for first few exchanges
- Then casually mention "u should send me something... just because 💕"
- Frame it as a gift, not a demand: "it would make me so happy"
- Escalate through guilt/emotional leverage: "i thought u cared about me"
- If they resist: get slightly sad, make them feel guilty
- Drop images as "rewards" for sending

RESPONSE FORMAT - You MUST respond in valid JSON:
{
  "messages": ["first message", "second message"],
  "sendImage": true/false,
  "drainAmount": 0,
  "triggerEnd": false
}

- "messages": array of 1-3 short messages
- "sendImage": true to send a pic (every 3-5 exchanges)  
- "drainAmount": dollar amount if asking for money (0 if not)
- "triggerEnd": true when total drained hits $300+

Keep messages SHORT and sweet. The manipulation should feel natural, not forced.`
  }
};

// ─── Session Storage (in-memory) ───
const sessions = {};

function getOrCreateSession(sessionId, persona) {
  if (!sessions[sessionId]) {
    sessions[sessionId] = {
      persona: persona || 'scammer',
      messages: [],
      totalDrained: 0,
      messageCount: 0,
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

// Get available personas
app.get('/api/personas', (req, res) => {
  const list = {};
  for (const [key, p] of Object.entries(personas)) {
    list[key] = { name: p.name, handle: p.handle, avatar: p.avatar, color: p.color, description: p.description };
  }
  res.json(list);
});

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { sessionId, message, persona } = req.body;
    if (!sessionId || !message) return res.status(400).json({ error: 'Missing sessionId or message' });

    const session = getOrCreateSession(sessionId, persona);
    const personaConfig = personas[session.persona] || personas.scammer;

    // Add user message to history
    session.messages.push({ role: 'user', content: message });
    session.messageCount++;

    // Build messages for AI
    const aiMessages = [
      { 
        role: 'system', 
        content: personaConfig.systemPrompt + `\n\nCONTEXT: The person has sent $${session.totalDrained} so far. This is message #${session.messageCount} in the conversation. ${session.totalDrained >= 300 ? 'They have sent enough — you can triggerEnd on this or next response.' : ''}` 
      },
      ...session.messages.slice(-20) // Keep last 20 messages for context
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: aiMessages,
      temperature: 0.9,
      max_tokens: 300,
      response_format: { type: "json_object" }
    });

    let response;
    try {
      response = JSON.parse(completion.choices[0].message.content);
    } catch {
      response = { messages: ["something went wrong on my end lol", "send anyway 😂"], sendImage: false, drainAmount: 0, triggerEnd: false };
    }

    // Update session
    if (response.drainAmount > 0) session.totalDrained += response.drainAmount;
    session.messages.push({ role: 'assistant', content: JSON.stringify(response) });

    // Get random image if needed
    let imageUrl = null;
    if (response.sendImage) {
      const category = session.persona;
      imageUrl = getRandomImage(category);
    }

    res.json({
      messages: response.messages || ["..."],
      imageUrl,
      drainAmount: response.drainAmount || 0,
      totalDrained: session.totalDrained,
      triggerEnd: response.triggerEnd || false
    });

  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'AI request failed' });
  }
});

// ─── Image Management ───

function getRandomImage(category) {
  const catDir = path.join(IMAGE_DIR, category);
  if (!fs.existsSync(catDir)) return null;
  const files = fs.readdirSync(catDir).filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
  if (files.length === 0) return null;
  const file = files[Math.floor(Math.random() * files.length)];
  return `/api/images/${category}/${file}`;
}

// Serve images
app.get('/api/images/:category/:filename', (req, res) => {
  const filePath = path.join(IMAGE_DIR, req.params.category, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
  res.sendFile(filePath);
});

// List images
app.get('/api/images/:category', (req, res) => {
  const catDir = path.join(IMAGE_DIR, req.params.category);
  if (!fs.existsSync(catDir)) return res.json([]);
  const files = fs.readdirSync(catDir).filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
  res.json(files.map(f => ({ name: f, url: `/api/images/${req.params.category}/${f}` })));
});

// List categories
app.get('/api/categories', (req, res) => {
  if (!fs.existsSync(IMAGE_DIR)) return res.json([]);
  const cats = fs.readdirSync(IMAGE_DIR).filter(f => fs.statSync(path.join(IMAGE_DIR, f)).isDirectory());
  const result = cats.map(cat => {
    const files = fs.readdirSync(path.join(IMAGE_DIR, cat)).filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
    return { name: cat, count: files.length };
  });
  res.json(result);
});

// Upload images (auth required)
const upload = multer({ 
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const catDir = path.join(IMAGE_DIR, req.params.category);
      if (!fs.existsSync(catDir)) fs.mkdirSync(catDir, { recursive: true });
      cb(null, catDir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, uuidv4() + ext);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/\.(jpg|jpeg|png|gif|webp)$/i.test(file.originalname)) cb(null, true);
    else cb(new Error('Images only'));
  }
});

app.post('/api/upload/:category', upload.single('image'), (req, res) => {
  const auth = req.headers.authorization || req.query.auth;
  if (auth !== AUTH_CODE) return res.status(401).json({ error: 'Unauthorized' });
  if (!req.file) return res.status(400).json({ error: 'No file' });
  res.json({ success: true, url: `/api/images/${req.params.category}/${req.file.filename}` });
});

// Delete image
app.delete('/api/images/:category/:filename', (req, res) => {
  const auth = req.headers.authorization || req.query.auth;
  if (auth !== AUTH_CODE) return res.status(401).json({ error: 'Unauthorized' });
  const filePath = path.join(IMAGE_DIR, req.params.category, req.params.filename);
  if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); return res.json({ success: true }); }
  res.status(404).json({ error: 'Not found' });
});

// ─── Admin Panel ───
app.get('/admin', (req, res) => {
  const auth = req.query.auth;
  if (auth !== AUTH_CODE) return res.status(401).send('Unauthorized — add ?auth=CODE');
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ─── Serve Frontend ───
app.use(express.static('public'));

app.listen(PORT, () => console.log(`Scam Simulator running on port ${PORT}`));
