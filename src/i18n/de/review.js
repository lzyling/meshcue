export default {
  "review.loadingModel": "Modell wird geladen",
  "review.earlierVersion": "Frühere Version · weiterhin markierbar",
  "review.openElsewhere": "Ein anderes Fenster hat diese Version geöffnet",
  "review.current": "Aktuelle Version · bereit zum Markieren",
  "review.notInReview": "Diese Version gehört nicht zur laufenden Prüfung.",
  "review.notMarked": "Auf dieser Version ist noch nichts markiert.",
  "review.roundClosed":
    "Diese Runde ist beendet; erneutes Markieren beginnt eine neue.",

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
  "recovery.backedUp.named":
    "Der nicht synchronisierte Entwurf wurde separat gesichert und kann für {agent} heruntergeladen werden; Sie sehen jetzt die vom Server gespeicherte Version.",
  "recovery.paused":
    "Der lokale Speicher ist voll. Der nicht synchronisierte Entwurf ist geschützt und die Bearbeitung pausiert; laden Sie die Sicherung für den Agenten herunter.",
  "recovery.paused.named":
    "Der lokale Speicher ist voll. Der nicht synchronisierte Entwurf ist geschützt und die Bearbeitung pausiert; laden Sie die Sicherung für {agent} herunter.",

  "echo.summary": "Der Agent versteht: {summary}",
  "echo.summary.named": "{agent} versteht: {summary}",
  "echo.recall": "Das Verständnis des Agenten erneut lesen",
  "echo.recall.named": "Erneut lesen, was {agent} verstanden hat",
  "echo.dismiss": "Wegklappen",
  "echo.stale":
    "Die Markierungen haben sich geändert — korrigieren Sie das Verständnis im ursprünglichen Gespräch",

  "outbox.reason": "Grund: {message}",
  "outbox.reasonUnknown": "Grund unbekannt",
  "outbox.stuck":
    "{count} Stapel haben den Agenten noch nicht erreicht ({attempts} Versuche, wird weiter versucht). {reason}. Die Markierungen sind auf diesem Rechner gespeichert — erwähnen Sie es im ursprünglichen Gespräch.",
  "outbox.stuck.named":
    "{count} Stapel haben {agent} noch nicht erreicht ({attempts} Versuche, wird weiter versucht). {reason}. Die Markierungen sind auf diesem Rechner gespeichert — erwähnen Sie es im ursprünglichen Gespräch.",
  "outbox.retrying":
    "{count} Stapel haben den Agenten noch nicht erreicht; erneuter Versuch (Versuch {attempts}). {reason}. Die Markierungen sind gespeichert — ein erneutes Markieren ist nicht nötig.",
  "outbox.retrying.named":
    "{count} Stapel haben {agent} noch nicht erreicht; erneuter Versuch (Versuch {attempts}). {reason}. Die Markierungen sind gespeichert — ein erneutes Markieren ist nicht nötig.",

  "feedback.default":
    "Markierungen tragen ihre 3D-Position und die aktuelle Version",
  "feedback.notSubmitted":
    "Nicht gesendet · der Entwurf speichert sich von selbst",
  "feedback.sentCount": "Markierungen gesendet: {count}",
  "feedback.delivered": "im ursprünglichen Gespräch zugestellt",
  "feedback.acceptedPending": "angenommen, Zustellung noch nicht bestätigt",
  "feedback.deliveryUnconfirmed":
    "Zustellung unbestätigt, wird erneut versucht",
  "feedback.read": "der Agent hat sie gelesen",
  "feedback.read.named": "{agent} hat sie gelesen",
  "feedback.unread": "wartet darauf, dass der Agent sie liest",
  "feedback.unread.named": "wartet darauf, dass {agent} sie liest",
  "feedback.alsoUnsubmitted": "; weitere Änderungen sind noch nicht gesendet",
  "feedback.submit": "An den Agenten",
  "feedback.submit.named": "An {agent}",
  "feedback.submitting": "Wird gesendet …",
  "feedback.submitted":
    "Markierungen gespeichert; der Sendestatus richtet sich nach der tatsächlichen Bestätigung. Das Modell bleibt gesperrt.",

  "receipt.next":
    "Was der Agent verstanden hat, erscheint unten rechts am Modell",
  "receipt.next.named":
    "Was {agent} verstanden hat, erscheint unten rechts am Modell",
  "receipt.understood":
    "Was der Agent verstanden hat, kam um {time} – unten rechts am Modell",
  "receipt.understood.named":
    "Was {agent} verstanden hat, kam um {time} – unten rechts am Modell",
  "receipt.nudge":
    "Der Agent wird nicht automatisch benachrichtigt. Sagen Sie es ihm in seinem Gespräch – diesen Satz können Sie einfügen:",
  "receipt.nudge.named":
    "{agent} wird nicht automatisch benachrichtigt. Sagen Sie es im Gespräch – diesen Satz können Sie einfügen:",
  "receipt.line":
    "Ich habe meine MeshCue-Markierungen gesendet ({count}). Bitte lies sie mit meshcue read – project {project}, submissionId {submission}",
  "receipt.lineNoProject":
    "Ich habe meine MeshCue-Markierungen gesendet ({count}). Bitte lies sie mit meshcue read – submissionId {submission}",
  "receipt.copy": "Kopieren",
  "receipt.copied": "Kopiert",
  "receipt.copyTitle": "Diesen Satz kopieren",
  "receipt.copyFailed":
    "Kopieren nicht möglich – der Satz ist markiert, bitte selbst kopieren",
  "receipt.listJoin": ", ",
  "receipt.chatSent":
    "📐 Markierungen erhalten: {count} ({marks}). An den Agenten übergeben, wird gerade gelesen …",
  "receipt.chatSent.named":
    "📐 Markierungen erhalten: {count} ({marks}). An {agent} übergeben, wird gerade gelesen …",
  "receipt.chatRead":
    "📐 Markierungen erhalten: {count} ({marks}). Der Agent hat sie gelesen und arbeitet heraus, was gemeint ist …",
  "receipt.chatRead.named":
    "📐 Markierungen erhalten: {count} ({marks}). {agent} hat sie gelesen und arbeitet heraus, was gemeint ist …",
};
