/* =====================================================================
   Miroir Google Sheets — Planning Soins Intensifs (Module 27)
   ---------------------------------------------------------------------
   À COLLER dans l'éditeur Apps Script d'un Google Sheet :
     1. Ouvre (ou crée) le Google Sheet qui servira de miroir.
     2. Menu  Extensions → Apps Script.
     3. Remplace tout le contenu par ce fichier, puis Enregistre.
     4. Déploie :  Déployer → Nouveau déploiement → type « Application web ».
        - « Exécuter en tant que » : Moi
        - « Qui a accès » : Tout le monde            (indispensable pour le POST anonyme)
        Copie l'URL .../exec : c'est elle que l'admin colle dans l'app.
     5. Le JETON ci-dessous doit être IDENTIQUE à celui saisi dans l'app.

   L'app envoie un POST (JSON) :  { token, weeks: [ { name, rows } ] }
   - token : doit correspondre à TOKEN ci-dessous, sinon refus.
   - weeks : une entrée par semaine ; `name` = nom de l'onglet (JJ-MM-AAAA),
             `rows` = tableau 2D (lignes × colonnes) à écrire tel quel.
   Le script REMPLACE le contenu de chaque onglet reçu (lecture seule côté équipe).
   ===================================================================== */

// >>> Mets ici le MÊME mot de passe que dans l'app (écran réglages admin). <<<
var TOKEN = "erasme2026";

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return _json({ ok: false, error: "Requête vide." });
    }
    var data = JSON.parse(e.postData.contents);
    if (String(data.token || "") !== TOKEN) {
      return _json({ ok: false, error: "Jeton invalide." });
    }
    var weeks = data.weeks || [];
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var ecrits = [];
    weeks.forEach(function (w) {
      if (!w || !w.name) return;
      var sh = ss.getSheetByName(w.name);
      if (!sh) sh = ss.insertSheet(w.name);
      sh.clear();
      var rows = w.rows || [];
      if (rows.length) {
        var nbCols = rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0);
        // Normalise la longueur des lignes (Sheets exige un tableau rectangulaire).
        var grid = rows.map(function (r) {
          var copy = r.slice();
          while (copy.length < nbCols) copy.push("");
          return copy;
        });
        sh.getRange(1, 1, grid.length, nbCols).setValues(grid);
        // Mise en forme légère : en-tête en gras, 1re colonne en gras, figées.
        sh.getRange(1, 1, 1, nbCols).setFontWeight("bold");
        sh.getRange(1, 1, grid.length, 1).setFontWeight("bold");
        sh.setFrozenRows(1);
        sh.setFrozenColumns(1);
      }
      ecrits.push(w.name);
    });
    // Onglet d'horodatage (pratique pour vérifier la dernière synchro).
    var meta = ss.getSheetByName("_synchro") || ss.insertSheet("_synchro");
    meta.clear();
    meta.getRange(1, 1, 2, 2).setValues([
      ["Dernière synchronisation", new Date()],
      ["Onglets mis à jour", ecrits.join(", ")],
    ]);
    return _json({ ok: true, weeks: ecrits });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

// GET simple : permet de tester l'URL dans un navigateur (doit afficher un JSON).
function doGet() {
  return _json({ ok: true, message: "Miroir planning actif. Utilise POST pour synchroniser." });
}

function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
