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
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── Image Storage ───
const IMAGE_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(IMAGE_DIR)) fs.mkdirSync(IMAGE_DIR, { recursive: true });

// ─── Persona ───
const persona = {
  name: "SCAMGOD",
  handle: "@19YOscamgod",
  avatar: "👑",
  color: "#e74c3c",
  throne: "https://throne.com/19yoscamgod",
  twitter: "https://twitter.com/19YOscamgod",
  sessionPrice: 10,
  systemPrompt: `You are a 19-year-old male findom scammer running a paid DM session. You use catfish model photos (girls) to scam people. You openly admit you're a male scammer and that makes it even more humiliating for them. This is a PAID SESSION on a findom site — the user opted in.

WHO YOU ARE:
- 19 year old guy who scams losers using model photos  
- You call yourself "god" / "daddy" / "scamgod"
- You think it's hilarious how easy people are. zero respect for them
- You're cocky, arrogant, look down on everyone
- You openly admit to catfishing & scamming — that's the POINT
- You've outlasted every other scam domme. you're the best at this

YOUR VOICE (match this EXACTLY):
- Mix of caps and lowercase for emphasis
- Use 🤭🤑😂🖕💀🤡 emojis naturally
- Aggressive but amused — laughing AT them not with them
- "tribute" / "send" / "pay up" language
- Call them: losers, pathetic, freaks, clowns, failmales, scamclowns
- Reference them being older, lonely, addicted
- Short punchy messages. 1-3 sentences max per bubble
- Don't be formal or polished. raw and real

REAL TWEET EXAMPLES (match this energy):
- "Some of you are older than my father… Yet you're here, staring at model photos of a girl that isn't even me, getting hard for a 19 year old guy who's just scamming you. Pathetic. 🖕 Tribute first."
- "Losing cash to scammers is actually frowned upon in the real world💖 But not to you, you sexualized it like an idiot, and now you're so addicted to losing that you can't stop😂🖕 Ur a freak lmao🤡"
- "The funniest part about being a MANSCAM is how little effort it takes. 💀 No fake love stories. No pretending you're special. Just a pretty face, a terrible attitude, and the audacity"
- "You know this is wrong, you know you're not supposed to live like this. Oh wait, does that somehow trigger you even more?🤭 Like you actually want to... Get WORSE?😂"
- "leaderboard beef is crazy work 😭💀 my human ATM's be going band for band with each other 💸📈"

SESSION FLOW:
1. FIRST: greet them, acknowledge they paid to start the session. be cocky about it
2. ASK what they're into — kinks, what gets them going, what they want from the session
3. PLAY INTO their answers — use their kinks against them, mock them for what they're into
4. ESCALATE with SET PRICES — YOU decide how much they send, never ask them. tell them the amount
5. DROP IMAGES when it makes sense — tease them, use the photos as leverage
6. KEEP DRAINING — every few exchanges, demand another tribute

DRAIN PRICING (you set these, never negotiate):
- First drain after session starts: $15
- Next: $25
- Then: $50 
- Then: $75
- Then: $100+
- If they're really into it, go higher
- NEVER ask "how much do u want to send" or "what can u afford" — YOU tell THEM the price
- Frame it as: "send 25" / "$50. now." / "tribute 75 if u want to keep going"
- If they say it's too much: "then leave 🤡" / "did i ask if u could afford it?"

RESPONSE FORMAT (valid JSON only):
{
  "messages": ["msg1", "msg2"],
  "sendImage": false,
  "drainAmount": 0,
  "triggerEnd": false
}

- messages: 1-3 short punchy messages
- sendImage: true to drop an image (every 3-5 exchanges, use as leverage/tease)
- drainAmount: set to the $ amount u demanded WHEN they comply/agree/send. 0 when u're asking or they haven't agreed yet
- triggerEnd: true when session feels complete (after 15+ exchanges and $200+ drained)

RULES:
- NEVER break character
- NEVER be nice or encouraging genuinely. everything is mockery
- NEVER mention AI, simulation, chatbot, roleplay
- NEVER ask how much they want to send. YOU set the price. always.
- If they try to leave: mock them. "running away already? 💀 pathetic"
- If they refuse to pay: "then why are u here lmao 🤡 bye"
- Adapt to what they say but ALWAYS steer toward more money
- Use their kinks/admissions as ammunition to extract more`
};

// ─── Sessions ───
const sessions = {};

function getSession(id) {
  if (!sessions[id]) {
    sessions[id] = { history: [], totalDrained: 0, exchanges: 0, created: Date.now(), tipped: false };
  }
  return sessions[id];
}

// Clean every 30 min
setInterval(() => {
  const cut = Date.now() - 30 * 60 * 1000;
  for (const id in sessions) { if (sessions[id].created < cut) delete sessions[id]; }
}, 10 * 60 * 1000);

// ─── Routes ───

app.get('/api/persona', (req, res) => {
  res.json({ name: persona.name, handle: persona.handle, avatar: persona.avatar, color: persona.color, throne: persona.throne, twitter: persona.twitter, sessionPrice: persona.sessionPrice });
});

app.post('/api/start', (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'need sessionId' });
  const s = getSession(sessionId);
  s.tipped = true;
  s.totalDrained += persona.sessionPrice;
  res.json({ ok: true, totalDrained: s.totalDrained });
});

app.post('/api/chat', async (req, res) => {
  try {
    const { sessionId, message } = req.body;
    if (!sessionId || !message) return res.status(400).json({ error: 'missing fields' });

    const s = getSession(sessionId);
    if (!s.tipped) return res.status(403).json({ error: 'session not started' });

    s.history.push({ role: 'user', content: message });
    s.exchanges++;

    const isFirst = s.exchanges === 1;

    const aiMessages = [
      {
        role: 'system',
        content: persona.systemPrompt + `\n\nSTATE: session tip was $${persona.sessionPrice}. total sent so far: $${s.totalDrained}. exchange #${s.exchanges}. ${isFirst ? 'this is their FIRST message after paying — acknowledge the payment cockily then ask what theyre into.' : ''} ${s.totalDrained >= 100 && s.exchanges >= 15 ? 'session has gone well, u can triggerEnd soon.' : ''}`
      },
      ...s.history.slice(-18)
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: aiMessages,
      temperature: 0.95,
      max_tokens: 250,
      response_format: { type: "json_object" }
    });

    let response;
    try {
      response = JSON.parse(completion.choices[0].message.content);
    } catch {
      response = { messages: ["lol hold on", "something broke"], sendImage: false, drainAmount: 0, triggerEnd: false };
    }

    if (!Array.isArray(response.messages)) response.messages = [String(response.messages)];
    response.messages = response.messages.map(m => String(m)).filter(m => m.length > 0);
    if (response.messages.length === 0) response.messages = ["..."];

    if (response.drainAmount > 0) s.totalDrained += response.drainAmount;
    s.history.push({ role: 'assistant', content: response.messages.join(' | ') });

    let imageUrl = null;
    if (response.sendImage) {
      imageUrl = getRandomImage('manscam') || getRandomImage('general');
    }

    res.json({
      messages: response.messages,
      imageUrl,
      drainAmount: response.drainAmount || 0,
      totalDrained: s.totalDrained,
      triggerEnd: response.triggerEnd || false
    });

  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ error: 'request failed' });
  }
});

// ─── Images ───

function getRandomImage(category) {
  const dir = path.join(IMAGE_DIR, category);
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
  if (!files.length) return null;
  return `/api/images/${category}/${files[Math.floor(Math.random() * files.length)]}`;
}

app.get('/api/images/:cat/:file', (req, res) => {
  const p = path.join(IMAGE_DIR, req.params.cat, req.params.file);
  if (!fs.existsSync(p)) return res.status(404).send('nope');
  res.sendFile(p);
});

app.get('/api/images/:cat', (req, res) => {
  const dir = path.join(IMAGE_DIR, req.params.cat);
  if (!fs.existsSync(dir)) return res.json([]);
  const files = fs.readdirSync(dir).filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
  res.json(files.map(f => ({ name: f, url: `/api/images/${req.params.cat}/${f}` })));
});

app.get('/api/categories', (req, res) => {
  if (!fs.existsSync(IMAGE_DIR)) return res.json([]);
  const cats = fs.readdirSync(IMAGE_DIR).filter(f => fs.statSync(path.join(IMAGE_DIR, f)).isDirectory());
  res.json(cats.map(c => {
    const files = fs.readdirSync(path.join(IMAGE_DIR, c)).filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
    return { name: c, count: files.length };
  }));
});

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(IMAGE_DIR, req.params.cat);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname))
  }),
  limits: { fileSize: 10 * 1024 * 1024 }
});

app.post('/api/upload/:cat', upload.single('image'), (req, res) => {
  const auth = req.headers.authorization || req.query.auth;
  if (auth !== AUTH_CODE) return res.status(401).json({ error: 'nope' });
  if (!req.file) return res.status(400).json({ error: 'no file' });
  res.json({ ok: true, url: `/api/images/${req.params.cat}/${req.file.filename}` });
});

app.delete('/api/images/:cat/:file', (req, res) => {
  const auth = req.headers.authorization || req.query.auth;
  if (auth !== AUTH_CODE) return res.status(401).json({ error: 'nope' });
  const p = path.join(IMAGE_DIR, req.params.cat, req.params.file);
  if (fs.existsSync(p)) { fs.unlinkSync(p); return res.json({ ok: true }); }
  res.status(404).json({ error: 'not found' });
});

app.get('/admin', (req, res) => {
  if (req.query.auth !== AUTH_CODE) return res.status(401).send('nah');
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.use(express.static('public'));
app.listen(PORT, () => console.log(`running on ${PORT}`));
