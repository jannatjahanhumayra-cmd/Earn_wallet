// ===== FRONTEND SERVING =====
// public ফোল্ডার থেকে CSS, JS, HTML সার্ভ করবে
app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
