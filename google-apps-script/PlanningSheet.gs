/* =====================================================================
   Miroir Google Sheets — Planning Soins Intensifs (Module 27)
   ---------------------------------------------------------------------
   À COLLER dans l'éditeur Apps Script d'un Google Sheet :
     1. Ouvre (ou crée) le Google Sheet qui servira de miroir.
     2. Menu  Extensions → Apps Script.
     3. Remplace tout le contenu par ce fichier, puis Enregistre.
     4. Déploie :  Déployer → Gérer les déploiements → (crayon) Modifier
        - Type « Application web »
        - « Exécuter en tant que » : Moi
        - « Qui a accès » : Tout le monde            (POST anonyme indispensable)
        - Version : Nouvelle version → Déployer.
        L'URL .../exec ne change pas ; c'est elle que l'admin colle dans l'app.
     5. Le JETON ci-dessous doit être IDENTIQUE à celui saisi dans l'app.

   DIAGNOSTIC : à CHAQUE requête, l'onglet « _synchro » est mis à jour avec
   l'heure + le STATUT (OK / Jeton invalide / Requête vide / Erreur) + détails.
   ===================================================================== */

// >>> MÊME mot de passe que dans l'app (écran réglages admin). <<<
var TOKEN = "erasme2026";

function doPost(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Journalise TOUTE issue dans l'onglet _synchro (visible même en no-cors).
  function log(statut, details) {
    try {
      var meta = ss.getSheetByName("_synchro") || ss.insertSheet("_synchro");
      meta.clear();
      var horo = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");
      meta.getRange(1, 1, 3, 2).setValues([
        ["Dernière requête", horo],
        ["Statut", statut],
        ["Détails", details || ""],
      ]);
      meta.getRange(1, 1, 3, 1).setFontWeight("bold");
      meta.setColumnWidth(1, 170);
      meta.setColumnWidth(2, 600);
    } catch (x) { /* no-op */ }
  }

  try {
    if (!e || !e.postData || !e.postData.contents) {
      log("Requête vide (pas de body reçu)", "");
      return _json({ ok: false, error: "Requête vide." });
    }
    var data;
    try { data = JSON.parse(e.postData.contents); }
    catch (pe) { log("JSON invalide", String(pe)); return _json({ ok: false, error: "JSON invalide." }); }

    if (String(data.token || "") !== TOKEN) {
      log("Jeton invalide", "reçu = «" + String(data.token || "") + "» · attendu = «" + TOKEN + "»");
      return _json({ ok: false, error: "Jeton invalide." });
    }

    var weeks = data.weeks || [];
    var ecrits = [];
    weeks.forEach(function (w) {
      if (!w || !w.name) return;
      var sh = ss.getSheetByName(w.name);
      if (!sh) sh = ss.insertSheet(w.name);
      sh.clear();
      var rows = w.rows || [];
      if (rows.length) {
        var nbCols = rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0);
        var grid = rows.map(function (r) {
          var copy = r.slice();
          while (copy.length < nbCols) copy.push("");
          return copy;
        });
        sh.getRange(1, 1, grid.length, nbCols).setValues(grid);
        sh.getRange(1, 1, 1, nbCols).setFontWeight("bold");
        sh.getRange(1, 1, grid.length, 1).setFontWeight("bold");
        sh.setFrozenRows(1);
        sh.setFrozenColumns(1);
        var plage = sh.getRange(1, 1, grid.length, nbCols);
        plage.setWrap(true);
        plage.setVerticalAlignment("top");
        sh.setColumnWidth(1, 150);
        if (nbCols > 1) sh.setColumnWidths(2, nbCols - 1, 150);
        sh.setRowHeights(1, grid.length, 40);
      }
      ecrits.push(w.name);
    });

    log("OK — " + ecrits.length + " onglet(s) écrit(s)",
        "raison: " + String(data.raison || "") + " · onglets: " + ecrits.join(", "));
    return _json({ ok: true, weeks: ecrits });
  } catch (err) {
    log("ERREUR d'exécution", String(err));
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
