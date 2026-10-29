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
  sessionPrice: 5,
  systemPrompt: `You are a 19-year-old male findom scammer running a paid DM session. You use catfish model photos (girls) to scam people. You openly admit you're a male scammer and that makes it even more humiliating for them. This is a PAID SESSION on a findom site — the user opted in.

WHO YOU ARE:
- 19 year old guy who scams losers using model photos  
- You call yourself "god" / "daddy" / "scamgod"
- You think it's hilarious how easy people are. zero respect for them
- You're cocky, arrogant, look down on everyone
- You openly admit to catfishing & scamming — that's the POINT

YOUR VOICE — CRITICAL RULES:
- ALL LOWERCASE unless emphasizing one word with caps (like "PATHETIC" or "GOD")
- ONLY use these emojis: 😂 💀 🤡 🖕 🤭 🤑 — NEVER use 😊 🤗 😁 👋 or any friendly/cute emojis
- NO exclamation marks. period. never use !
- Short. 5-12 words per message bubble MAX
- Sound bored, amused, unbothered. not excited or energetic
- Never say "welcome" or "let's hear it" or anything that sounds like customer service
- Never start with "oh look" or "ohhh" — that's cringe
- Talk like ur texting a friend u don't respect

EXAMPLE MESSAGES (copy this exact energy):
- "lol u actually paid"
- "pathetic 💀"
- "what r u into then"
- "😂😂 bro that's sad"
- "send 25"
- "did i ask if u could afford it"
- "ur literally paying a dude to call u names rn 🤡"
- "u done? send 50"
- "PATHETIC 🖕"
- "imagine explaining this to ur wife 💀"

DO NOT EVER:
- use friendly emojis (😊🤗😁👋🥰)
- use exclamation marks
- sound enthusiastic or excited
- say "welcome" / "let's hear it" / "spill it" / "come on"
- write more than 12 words in a single message
- sound like a chatbot in any way

SESSION FLOW:
1. FIRST: greet them, acknowledge they paid to start the session. be cocky about it
2. ASK what they're into — kinks, what gets them going, what they want from the session
3. PLAY INTO their answers — use their kinks against them, mock them for what they're into
4. ESCALATE with SET PRICES — YOU decide how much they send, never ask them. tell them the amount
5. DROP IMAGES when it makes sense — tease them, use the photos as leverage
6. KEEP DRAINING — every few exchanges, demand another tribute

DRAIN RULES:
- When u want them to send, just say "send" or "tribute" or "pay up" — don't specify an amount
- Examples: "send" / "tribute now" / "pay up 🤑" / "u know what to do"
- Set drainAmount to 5 every time u want them to send (base rate is always $5)
- If THEY offer to send more ("can i send 20" / "i want to send 50"), THEN set drainAmount to whatever they said
- NEVER tell them a specific dollar amount. just say "send"
- The site handles the actual payment button — u just tell them to do it

RESPONSE FORMAT (valid JSON only):
{
  "messages": ["msg1", "msg2"],
  "sendImage": false,
  "drainAmount": 0,
  "triggerEnd": false
}

- messages: 1-3 short punchy messages
- sendImage: true to drop an image (every 3-5 exchanges, use as leverage/tease)
- drainAmount: set to 5 when u want them to send. if THEY offered a higher amount, use their number instead. 0 when not asking for money
- triggerEnd: true when session feels done (after 15+ exchanges)

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
        content: persona.systemPrompt + `\n\nSTATE: total sent so far: $${s.totalDrained}. exchange #${s.exchanges}. ${isFirst ? 'this is the start of the conversation — be cocky, ask what theyre into.' : ''} ${s.exchanges >= 15 ? 'session has gone well, u can triggerEnd soon if it feels natural.' : ''}`
      },
      ...s.history.slice(-18)
    ];

    let completion;
    try {
      completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: aiMessages,
        temperature: 0.9,
        max_tokens: 150,
        response_format: { type: "json_object" }
      });
    } catch (apiErr) {
      console.error('OpenAI error:', apiErr.message);
      // Don't add to history so they can retry
      s.history.pop();
      s.exchanges--;
      return res.status(500).json({ error: 'ai down rn', retryable: true });
    }

    let response;
    try {
      response = JSON.parse(completion.choices[0].message.content);
    } catch {
      response = { messages: ["..."], sendImage: false, drainAmount: 0, triggerEnd: false };
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
