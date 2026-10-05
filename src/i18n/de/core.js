/* Deutsch. Die Werkzeugnamen sind bewusst kurz gehalten — „Radierer“ statt
   „Radiergummi“ —, weil sie in einer Leiste nebeneinander stehen. */
export default {
  "agent.withTool": "{name} ({tool})",

  "app.tagline": "3D-Modelle prüfen und markieren",
  "app.version": "Laufende Version",
  "app.updateHint":
    "Version {version} ist verfügbar. Bitten Sie Ihren Agenten, MeshCue zu aktualisieren.",
  "app.updateHint.named":
    "Version {version} ist verfügbar. Bitten Sie {agent}, MeshCue zu aktualisieren.",

  "closing.pending":
    "Diese Prüfung wurde eine Weile nicht genutzt und wird geschlossen. Alles, was Sie hier tun, hält sie offen.",
  "closing.done":
    "Nach längerem Leerlauf geschlossen. Alle Versionen und Ihre gespeicherten Markierungen bleiben erhalten – bitten Sie den Agenten, diese Prüfung erneut zu öffnen.",
  "closing.done.named":
    "Nach längerem Leerlauf geschlossen. Alle Versionen und Ihre gespeicherten Markierungen bleiben erhalten – bitten Sie {agent}, diese Prüfung erneut zu öffnen.",
  "common.close": "Schließen",
  "common.version": "Version",

  "conn.connecting": "Verbinden",
  "conn.origin": "Antwortet im ursprünglichen Gespräch",
  "conn.collect": "Der Agent holt sie hier ab",
  "conn.collect.named": "{agent} holt sie hier ab",
  "conn.local": "Lokale Prüfung",
  "conn.returnToChat": "Zurück zum ursprünglichen Gespräch",
  "conn.paused": "Verbindung pausiert",
  "conn.accessExpired": "Zugriff abgelaufen · Entwurf bleibt erhalten",
  "conn.noAccess": "Noch kein Prüfzugriff",
  "conn.reclaimed": "Prüfung geschlossen · Markierungen gespeichert",
  "conn.offline": "Dienst ist offline",
  "conn.connectedNoAccess":
    "Mit der Werkbank verbunden; bis zur Freigabe wird kein Modell geladen.",
  "conn.dropped":
    "Die Verbindung zum Dienst ist abgebrochen; Ihr Entwurf bleibt erhalten.",
  "conn.actionFailed": "Die Aktion wurde nicht abgeschlossen.",
  "conn.noSecureRandom":
    "Diesem Browser fehlt eine sichere Zufallsquelle. Bitte eine aktuelle Version von Chrome oder Edge verwenden.",

  "error.empty":
    "Setzen Sie zuerst eine Markierung oder malen Sie einen Bereich",
  "error.saving":
    "Warten Sie, bis der Entwurf gespeichert ist, bevor Sie senden",
  "error.staleDraft":
    "Der Entwurf hat sich geändert; laden Sie die gespeicherte Fassung neu",
  "error.originBusy": "Ein anderes Gespräch nutzt diese Durchsicht gerade",
  "error.accessExpired":
    "Die einmalige Freigabe ist abgelaufen; kehren Sie zum Gespräch zurück",
  "error.accessLimit": "Diese Durchsicht hat ihre Verbindungsgrenze erreicht",
  "error.integrationDisabled":
    "MeshCue ist deaktiviert; Ihr Entwurf bleibt erhalten, machen Sie im Gespräch weiter",
  "error.deliveryUnconfirmed":
    "Zustellung noch nicht bestätigt; Ihre Markierungen sind gespeichert und werden erneut gesendet",
  "error.accessRequired":
    "Dieser Zugang hat keine gültige Prüfberechtigung. Bitte kehren Sie zum ursprünglichen Gespräch zurück.",

  "a11y.reviewPanel": "Modellprüfung",
  "a11y.versionTabs": "Modellversionen",
  "a11y.toolbar": "Modellwerkzeuge",
  "a11y.palette": "Markierungsfarbe",
  "a11y.viewer": "3D-Modellvorschau — drehen, zoomen und markieren",

  "model.awaiting": "Warten auf das Modell des Agenten",
  "model.awaiting.named": "Warten, bis {agent} ein Modell liefert",
  "model.awaitingFirst": "Warten auf das erste Modell des Agenten",
  "model.awaitingFirst.named": "Warten, bis {agent} das erste Modell liefert",
  "model.triangles": "{count} Dreiecke",
  "model.summary": "{count} Dreiecke · {format} · {units}",
  "units.unspecified": "ohne Einheit",
  "model.readFailed": "Die Modelldatei konnte nicht gelesen werden.",
  "model.versionMismatch":
    "Die Modelldatei entspricht nicht der vom Agenten angegebenen Version; Markieren gestoppt.",
  "model.versionMismatch.named":
    "Die Modelldatei entspricht nicht der von {agent} angegebenen Version; Markieren gestoppt.",
  "model.noExtent": "Das Modell hat keine darstellbare Ausdehnung.",
  "model.animated":
    "Bitte zuerst ein statisches Netz exportieren; diese Version markiert keine verformende Animation.",
  "model.tooManyTriangles":
    "Das Modell überschreitet 600.000 Dreiecke. Bitte zuerst vereinfachen.",
  "model.meshOverBudget":
    "Das Prüfnetz überschreitet die Grenze von 600.000 Dreiecken. Bitte das Modell zuerst vereinfachen.",
  "model.contextLost":
    "Der Anzeigekontext ging verloren; Ihr Entwurf bleibt erhalten. Bitte die Seite neu laden.",

  "save.preparing": "Wird vorbereitet",
  "save.saving": "Wird gespeichert …",
  "save.saved": "Entwurf gespeichert",
  "save.verifying": "Wird geprüft …",
  "save.restoring": "Entwurf wird wiederhergestellt …",
  "save.notStarted": "Noch keine Markierungen",
  "save.unsynced": "Nicht synchronisiert · Entwurf liegt auf diesem Rechner",
  "save.storageFull":
    "Der lokale Speicher ist voll. Lassen Sie diese Seite offen, damit der Server speichern kann.",

  "loading.preparing": "Prüfbereich wird vorbereitet",
  "loading.verifying": "Modellversion wird geladen und geprüft",
  "loading.rebuildingMesh": "Prüfnetz wird neu berechnet ({count} Dreiecke)",
  "loading.hint":
    "Sobald das Modell geladen ist, können Sie mit dem Markieren beginnen",

  "view.plain": "Neutrale Ansicht",
  "view.original": "Originalfarben",

  "cube.front": "VORN",
  "cube.back": "HINTEN",
  "cube.right": "RECHTS",
  "cube.left": "LINKS",
  "cube.top": "OBEN",
  "cube.bottom": "UNTEN",
  "cube.viewFrom": "Ansicht von {side}",
  "cube.sideJoin": "-",
  "cube.homeTitle": "Zurück zur Standardansicht",
  "cube.homeLabel": "Ansicht zurücksetzen",

  "tool.orbit": "Drehen",
  "tool.orbitLabel": "Drehwerkzeug",
  "tool.orbitTitle":
    "Modell drehen und ansehen; nichts wird gesetzt oder gemalt",
  "tool.label": "Marke",
  "tool.labelLabel": "Markenwerkzeug",
  "tool.labelTitle":
    "Klick auf eine Fläche setzt eine Marke; die rechte Taste dreht",
  "hint.label":
    "Auf eine Fläche klicken setzt eine Marke · die rechte Taste dreht weiterhin",
  "tool.bucket": "Füllen",
  "tool.bucketLabel": "Füllwerkzeug",
  "tool.bucketTitle":
    "Zeigt die zusammenhängende, nahezu ebene Fläche; Klick füllt sie",
  "tool.undo": "Rückgängig",
  "tool.undoTitle": "Rückgängig Strg/⌘ Z",
  "tool.redo": "Wiederholen",
  "tool.marks": "Markierungen",
  "tool.plain": "Neutral",
  "tool.spread": "Umfang",
  "tool.bucketSpread": "Füllumfang",
  "tool.newRegion": "Neue Fläche",
  "tool.newRegionHint": "Die nächste Füllung beginnt eine eigene Farbfläche.",
  "hint.orbit":
    "Links/rechts ziehen: drehen · Verschieben (H) oder Umschalt+Scrollen/Ziehen: verschieben · Rad/Aufziehen: zoomen",
  "hint.fill":
    "Zum Vorschauen schweben · klicken zum Füllen · die rechte Taste dreht weiterhin",
  "hint.relocate":
    "Auf eine Oberfläche klicken, um die Marke zu verschieben · Esc bricht ab",

  "settings.language": "Sprache der Oberfläche",
  "settings.theme": "Hell oder dunkel",
  "settings.themeSystem": "Dem System folgen",
  "settings.themeLight": "Hell",
  "settings.themeDark": "Dunkel",

  "tool.measure": "Messen",
  "tool.measureLabel": "Messwerkzeug",
  "tool.measureTitle":
    "Misst zwischen zwei Punkten, entlang einer Kante, zwischen zwei Flächen oder den Durchmesser eines Kreises; nichts bleibt, wenn Sie es nicht behalten",
  "hint.measurePoints":
    "Zwei Punkte anklicken · Ecken rasten ein · die rechte Taste dreht weiterhin",
  "hint.measureEdge":
    "Auf eine gerade Kante zeigen und klicken, um ihre Länge zu lesen · die rechte Taste dreht weiterhin",
  "hint.measurePlanes":
    "Eine ebene Fläche anklicken, dann eine zweite · die rechte Taste dreht weiterhin",
  "hint.measureCircle":
    "Drei Punkte auf dem Rand einer Bohrung oder Welle anklicken · Ecken rasten ein · die rechte Taste dreht weiterhin",
};
