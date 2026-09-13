/* Deutsch. Die Werkzeugnamen sind bewusst kurz gehalten — „Radierer“ statt
   „Radiergummi“ —, weil sie in einer Leiste nebeneinander stehen. */
export default {
  "app.tagline": "3D-Modelle prüfen und markieren",
  "app.preview": "Vorschau {version}",

  "common.close": "Schließen",
  "common.version": "Version",

  "conn.connecting": "Verbinden",
  "conn.origin": "Antwortet im ursprünglichen Gespräch",
  "conn.local": "Lokale Prüfung",
  "conn.returnToChat": "Zurück zum ursprünglichen Gespräch",
  "conn.paused": "Verbindung pausiert",
  "conn.accessExpired": "Zugriff abgelaufen · Entwurf bleibt erhalten",
  "conn.noAccess": "Noch kein Prüfzugriff",
  "conn.offline": "Dienst ist offline",
  "conn.connectedNoAccess":
    "Mit der Werkbank verbunden; bis zur Freigabe wird kein Modell geladen.",
  "conn.dropped":
    "Die Verbindung zum Dienst ist abgebrochen; Ihr Entwurf bleibt erhalten.",
  "conn.actionFailed": "Die Aktion wurde nicht abgeschlossen.",
  "conn.noSecureRandom":
    "Diesem Browser fehlt eine sichere Zufallsquelle. Bitte eine aktuelle Version von Chrome oder Edge verwenden.",

  "error.accessRequired":
    "Dieser Zugang hat keine gültige Prüfberechtigung. Bitte kehren Sie zum ursprünglichen Gespräch zurück.",

  "a11y.reviewPanel": "Modellprüfung",
  "a11y.versionTabs": "Modellversionen",
  "a11y.toolbar": "Modellwerkzeuge",
  "a11y.palette": "Markierungsfarbe",
  "a11y.viewer": "3D-Modellvorschau — drehen, zoomen und markieren",

  "model.awaiting": "Warten auf das Modell des Agenten",
  "model.awaitingFirst": "Warten auf das erste Modell des Agenten",
  "model.triangles": "{count} Dreiecke",
  "model.summary": "{count} Dreiecke · {format} · {units}",
  "model.readFailed": "Die Modelldatei konnte nicht gelesen werden.",
  "model.versionMismatch":
    "Die Modelldatei entspricht nicht der vom Agenten angegebenen Version; Markieren gestoppt.",
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

  "review.loadingModel": "Modell wird geladen",
  "review.earlierVersion": "Frühere Version · weiterhin markierbar",
  "review.openElsewhere": "Ein anderes Fenster hat diese Version geöffnet",
  "review.current": "Aktuelle Version · bereit zum Markieren",
  "review.notInReview": "Diese Version gehört nicht zur laufenden Prüfung.",
  "review.notMarked": "Auf dieser Version ist noch nichts markiert.",
  "review.roundClosed":
    "Diese Runde ist beendet; erneutes Markieren beginnt eine neue.",

  "marks.heading": "Markierungen dieser Runde",
  "marks.collapse": "Liste einklappen",
  "marks.expand": "Liste ausklappen",
  "marks.empty": "Markieren Sie die Stellen,\ndie geändert werden sollen.",
  "marks.limit": "Eine Runde fasst höchstens 200 Markierungen.",
  "marks.nearStrokeLimit":
    "Diese Runde nähert sich der Strichgrenze. Bitte diesen Stapel zuerst senden.",
  "marks.nearMarkLimit":
    "Diese Runde nähert sich der Markierungsgrenze. Bitte diesen Stapel zuerst senden.",
  "marks.pin": "Punktmarke",
  "marks.regionName": "{color} Fläche",
  "marks.pinned": "An der Oberfläche fixiert",
  "marks.alongSurface": "Entlang der Oberfläche markiert",
  "marks.legacyFace": "Alte Ganzflächen-Markierung · unverändert übernommen",
  "marks.one": "Markierung {label}",
  "marks.showOne": "{name} einblenden",
  "marks.hideOne": "{name} ausblenden",
  "marks.deleteLabel": "Marke {label} löschen",
  "marks.deleteOne": "{name} löschen",
  "marks.frame": "Zeigen",
  "marks.frameOne": "{name} zeigen",
  "marks.move": "Verschieben",
  "marks.moveLabel": "Marke {label} verschieben",
  "marks.moveHint":
    "Auf die Oberfläche klicken, um {label} zu verschieben; Esc bricht ab.",
  "marks.hide": "Markierungen aus",
  "marks.show": "Markierungen an",

  "color.red": "rote",
  "color.yellow": "gelbe",
  "color.green": "grüne",
  "color.blue": "blaue",
  "color.purple": "violette",
  "color.choose": "Farbe {color} wählen",

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

  "tool.orbit": "Drehen / Marke",
  "tool.orbitLabel": "Drehen und markieren",
  "tool.orbitTitle":
    "Doppelklick auf eine Fläche setzt eine Marke; die rechte Taste dreht",
  "tool.brush": "Pinsel",
  "tool.brushLabel": "Pinselwerkzeug",
  "tool.brushTitle": "Der Pinsel markiert nur sichtbare Oberflächen",
  "tool.eraser": "Radierer",
  "tool.eraserLabel": "Radierwerkzeug",
  "tool.eraserTitle": "Entfernt nur Markierungen",
  "tool.bucket": "Füllen",
  "tool.bucketLabel": "Füllwerkzeug",
  "tool.bucketTitle":
    "Zeigt die zusammenhängende, nahezu ebene Fläche; Klick füllt sie",
  "tool.undo": "Rückgängig",
  "tool.undoTitle": "Rückgängig Strg/⌘ Z",
  "tool.redo": "Wiederholen",
  "tool.size": "Größe",
  "tool.brushSize": "Pinselgröße",
  "tool.spread": "Umfang",
  "tool.bucketSpread": "Füllumfang",
  "tool.newRegion": "Neue Fläche",
  "tool.newRegionHint": "Der nächste Strich beginnt eine eigene Farbfläche.",
  "tool.eraseTooFine":
    "Beim Radieren sind zu viele kleine Bruchstücke entstanden. Bitte eine kleinere Fläche verwenden.",
  "tool.strokeTooBroad":
    "Dieser Strich berührt zu viele Flächen. Näher heranzoomen oder einen kleineren Pinsel verwenden; vorhandene Striche bleiben erhalten.",
  "tool.faceOverLimit":
    "Diese Fläche überschreitet die Grenze von 20.000 Dreiecken je Markierung; den Umfang verkleinern oder das Modell vereinfachen.",

  "hint.orbit":
    "Rechts ziehen dreht · Doppelklick markiert · zwei Finger oder Mitte verschiebt · Rad zoomt",
  "hint.paint":
    "Sichtbare Oberfläche bemalen · die rechte Taste dreht weiterhin",
  "hint.erase":
    "Sichtbare Striche löschen · das Modell bleibt unberührt · die rechte Taste dreht weiterhin",
  "hint.fill":
    "Zum Vorschauen schweben · klicken zum Füllen · die rechte Taste dreht weiterhin",
  "hint.relocate":
    "Auf eine Oberfläche klicken, um die Marke zu verschieben · Esc bricht ab",

  "version.showingNow": "Wird gerade gezeigt",
  "version.earlier": "Frühere Version",
  "version.submitted": "{count} gesendet",
  "version.openElsewhere": "In einem anderen Fenster geöffnet",
  "version.pinnedNotice":
    "Sie sehen eine frühere Version; die neueste ist {version}.",
  "version.goLatest": "Neueste Version anzeigen",
  "version.driftStopped":
    "Eine andere Version ist eingetroffen; Ihr Entwurf bleibt erhalten und der automatische Wechsel wurde gestoppt.",

  "resume.text": "Ein anderes Fenster hat diese Version ebenfalls geöffnet.",
  "resume.action": "Auf diesem Rechner weiter markieren",
  "resume.picked": "Vorhandener Entwurf übernommen.",

  "recovery.text":
    "Ein nicht synchronisierter Entwurf auf diesem Rechner wurde behalten; die aktuelle Version wurde nicht überschrieben.",
  "recovery.download": "Sicherung des Entwurfs herunterladen",
  "recovery.restored":
    "Der nicht synchronisierte Entwurf wurde wiederhergestellt.",
  "recovery.backedUp":
    "Der nicht synchronisierte Entwurf wurde separat gesichert und kann für den Agenten heruntergeladen werden; Sie sehen jetzt die vom Server gespeicherte Version.",
  "recovery.paused":
    "Der lokale Speicher ist voll. Der nicht synchronisierte Entwurf ist geschützt und die Bearbeitung pausiert; laden Sie die Sicherung für den Agenten herunter.",

  "echo.summary": "Der Agent versteht: {summary}",
  "echo.recall": "Das Verständnis des Agenten erneut lesen",
  "echo.dismiss": "Wegklappen",
  "echo.stale":
    "Die Markierungen haben sich geändert — korrigieren Sie das Verständnis im ursprünglichen Gespräch",

  "precision.overBudget":
    "Dieses Modell hat das Budget des Prüfnetzes ausgeschöpft (es benötigt {wanted} Dreiecke, das Budget beträgt {budget}). Große ebene Flächen werden nicht weiter unterteilt, der Pinsel springt dort in ganzen Stücken; Details sind nicht betroffen. Für feinere Striche bitten Sie den Agenten um einen Export mit kleinerer Sehnenhöhe.",

  "outbox.reason": "Grund: {message}",
  "outbox.reasonUnknown": "Grund unbekannt",
  "outbox.stuck":
    "{count} Stapel haben den Agenten noch nicht erreicht ({attempts} Versuche, wird weiter versucht). {reason}. Die Markierungen sind auf diesem Rechner gespeichert — erwähnen Sie es im ursprünglichen Gespräch.",
  "outbox.retrying":
    "{count} Stapel haben den Agenten noch nicht erreicht; erneuter Versuch (Versuch {attempts}). {reason}. Die Markierungen sind gespeichert — ein erneutes Markieren ist nicht nötig.",

  "feedback.default":
    "Markierungen tragen ihre 3D-Position und die aktuelle Version",
  "feedback.notSubmitted":
    "Nicht gesendet · der Entwurf speichert sich von selbst",
  "feedback.saved": "Gespeichert",
  "feedback.delivered": "im ursprünglichen Gespräch zugestellt",
  "feedback.acceptedPending": "angenommen, Zustellung noch nicht bestätigt",
  "feedback.deliveryUnconfirmed":
    "Zustellung unbestätigt, wird erneut versucht",
  "feedback.read": "der Agent hat sie gelesen",
  "feedback.unread": "wartet darauf, dass der Agent sie liest",
  "feedback.alsoUnsubmitted": "; weitere Änderungen sind noch nicht gesendet",
  "feedback.submit": "An den Agenten",
  "feedback.submitting": "Wird gesendet …",
  "feedback.submitted":
    "Markierungen gespeichert; der Sendestatus richtet sich nach der tatsächlichen Bestätigung. Das Modell bleibt gesperrt.",

  "settings.device": "Zeigegerät",
  "settings.deviceAuto": "Automatisch erkennen",
  "settings.deviceMouse": "Maus",
  "settings.deviceTrackpad": "Trackpad",
  "settings.language": "Sprache der Oberfläche",
  "settings.theme": "Hell oder dunkel",
  "settings.themeSystem": "Dem System folgen",
  "settings.themeLight": "Hell",
  "settings.themeDark": "Dunkel",

  "help.open": "Anleitung",
  "help.eyebrow": "SCHNELLSTART",
  "help.title": "Ansehen, markieren, dann sagen, was zu ändern ist.",
  "help.p1":
    "Mit rechts ziehen dreht, mit der mittleren Taste oder zwei Fingern verschiebt, Rad oder Pinch zoomt. Die linke Taste gehört nie der Kamera — markieren, ohne das Werkzeug zu wechseln.",
  "help.p2":
    "Marken: Doppelklick auf die Oberfläche setzt A, B, C; ein einfacher Klick setzt nichts. Pinsel: malt nur auf der sichtbaren Oberfläche — und die rechte Taste dreht weiterhin, das Malen muss dafür nie unterbrochen werden.",
  "help.p3":
    "Punktmarken erkennt man am Buchstaben, bemalte Flächen an der Farbe; die Farbe deckt nur die tatsächlichen Striche ab. Für eine getrennte Anmerkung „Neue Fläche“ drücken. Markierungen lassen sich rückgängig machen, wiederholen und einzeln löschen.",
  "help.p4":
    "Der Radierer entfernt nur sichtbare Striche und lässt die Materialien des Modells unberührt. Das Füllwerkzeug zeigt die zusammenhängende, nahezu ebene Fläche und füllt sie auf Klick; der Umfangsregler erscheint nur dafür. Füllen wirkt auf eine ganze zusammenhängende Oberfläche, auch auf hinter anderen Objekten verborgene Teile; Pinsel und Radierer dringen nicht durch.",
  "help.p5":
    "Markierungen sind am Muster zu unterscheiden und lassen sich mit einem Druck ausblenden; die neutrale Ansicht ist nur eine Sehhilfe. Markierungen bestehen allein in der Durchsicht — die Modelldatei beim Agenten trägt sie nie.",
  "help.p6":
    "„An den Agenten“ speichert und sendet die Markierungen. Kehren Sie ins ursprüngliche Gespräch zurück, um zu sagen, was geändert werden soll; bei Unklarheiten fragt der Agent nach. Das Senden allein ändert das Modell nicht.",
  "help.p7":
    "Die Reiter oben listen jede vom Agenten gelieferte Version. Ein Druck darauf zeigt sie erneut, und Sie können auch auf einer älteren Version direkt markieren und senden — jede Version hat ihren eigenen Entwurf, das Wechseln berührt die anderen nicht. Die Markierungen, die der Agent erhält, nennen die Version, für die sie gelten.",
  "help.p8":
    "„An den Agenten“ sendet diesen Stapel; der Agent antwortet mit einer neuen Version, auf der Sie weiter markieren. Es muss nichts abgeschlossen werden, und Entwürfe speichern sich selbst.",
  "help.p9":
    "Erste Fassung: GLB/STL, bis 80 MB und 600.000 Dreiecke. Animation, Skelette und komprimiertes GLB werden noch nicht unterstützt. Dies ist ein Prüfwerkzeug; es modelliert nicht.",
};
