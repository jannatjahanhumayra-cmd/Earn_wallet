// ===== FRONTEND SERVING =====
app.use(express.static(__dirname + '/../frontend'));

app.get('*', (req, res) => {
  res.sendFile(require('path').join(__dirname, '../frontend/index.html'));
});
