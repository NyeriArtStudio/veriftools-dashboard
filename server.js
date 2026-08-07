require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const fetch = require('node-fetch');
const STATES = require('./config/states');

const app = express();
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } });

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// SERVE STATIC FILES - THIS WAS MISSING
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.get('/api/states', (req, res) => {
    const stateList = Object.entries(STATES).map(([key, config]) => ({
        id: key,
        name: config.name,
        template_id: config.template_id
    }));
    res.json(stateList);
});

app.get('/api/states/:stateId/fields', (req, res) => {
    const state = STATES[req.params.stateId];
    if (!state) return res.status(404).json({ error: 'State not found' });
    res.json({ name: state.name, fields: state.fields });
});

app.post('/api/generate/:stateId', upload.single('photo'), async (req, res) => {
    try {
        const state = STATES[req.params.stateId];
        if (!state) return res.status(404).json({ error: 'State not found' });

        let photoBase64 = '';
        if (req.file) {
            photoBase64 = req.file.buffer.toString('base64');
        } else if (req.body.photoBase64) {
            photoBase64 = req.body.photoBase64.replace(/^data:image\/\w+;base64,/, '');
        }

        if (!photoBase64) {
            return res.status(400).json({ error: 'Photo required' });
        }

        const payload = state.buildPayload(req.body, photoBase64, process.env.API_KEY);

        console.log('\n[API CALL]', new Date().toISOString());
        console.log('State:', state.name);
        console.log('URL:', state.api_url);

        const response = await fetch(state.api_url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, image/*'
            },
            body: JSON.stringify(payload)
        });

        const contentType = response.headers.get('content-type') || '';
        const buffer = await response.buffer();
        const text = buffer.toString();

        console.log('Status:', response.status);
        console.log('Content-Type:', contentType);
        console.log('Preview:', text.substring(0, 150).replace(/\s+/g, ' '));

        const isHtml = text.trim().startsWith('<') || text.includes('<!DOCTYPE') || text.includes('<html');
        const isPaymentRelated = /credit|balance|wallet|payment|insufficient|top.up|new.site/i.test(text);

        if (isHtml && isPaymentRelated) {
            console.log('[ERROR] Payment required');
            return res.status(402).json({
                error: 'Payment Required',
                message: 'Your VerifTools wallet appears empty or API key is invalid',
                action: 'Log into your VerifTools dashboard and top up your balance',
                vendorUrl: 'https://veriftools.bz'
            });
        }

        if (isHtml) {
            console.log('[ERROR] Vendor HTML');
            return res.status(502).json({
                error: 'Vendor returned HTML',
                vendorResponse: text.substring(0, 500)
            });
        }

        if (contentType.includes('image')) {
            res.set('Content-Type', contentType);
            res.set('Content-Disposition', `inline; filename="${req.params.stateId}-license.png"`);
            return res.send(buffer);
        }

        try {
            res.json(JSON.parse(text));
        } catch {
            res.type('text').send(text);
        }

    } catch (error) {
        console.error('[ERROR]', error.message);
        res.status(500).json({ error: error.message });
    }
});

// CATCH-ALL: Serve index.html for any non-API route
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log('Available states:', Object.keys(STATES).join(', '));
});
