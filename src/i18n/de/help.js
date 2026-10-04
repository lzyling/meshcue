export default {
  "help.p12":
    "Schnitt: Entlang der X-, Y- oder Z-Achse des Modells schneiden, den Versatz in Modelleinheiten einstellen oder die entfernte Seite umkehren. Die bernsteinfarbene Schnittfläche dient nur der Ansicht und kann weder markiert noch gemessen werden. Verbleibende Vorderseiten lassen sich weiter markieren und messen. Der Schnitt dient nur der Ansicht, wird nie an den Agent gesendet und beim Laden eines anderen Modells oder einer anderen Version zurückgesetzt.",
  "help.p12.named":
    "Schnitt: Entlang der X-, Y- oder Z-Achse des Modells schneiden, den Versatz in Modelleinheiten einstellen oder die entfernte Seite umkehren. Die bernsteinfarbene Schnittfläche dient nur der Ansicht und kann weder markiert noch gemessen werden. Verbleibende Vorderseiten lassen sich weiter markieren und messen. Der Schnitt dient nur der Ansicht, wird nie an {agent} gesendet und beim Laden eines anderen Modells oder einer anderen Version zurückgesetzt.",

  "help.open": "Anleitung",
  "help.eyebrow": "SCHNELLSTART",
  "help.title": "Ansehen, markieren, dann sagen, was zu ändern ist.",
  "help.p1":
    "Mit Maus und Trackpad: rechts ziehen zum Drehen, Mausrad oder Aufziehen zum Zoomen zum Zeiger, Mitteltaste oder Umschalt+Scrollen zum Verschieben. Im Drehwerkzeug dreht auch linkes Ziehen; Umschalt+linkes oder rechtes Ziehen verschiebt. Markierungswerkzeuge behalten die linke Taste. Auf Touchscreens dreht ein Finger, zwei Finger zoomen oder verschieben; Antippen setzt keine Markierung.",
  "help.p2":
    "Marken: Werkzeug „Marke“ wählen und auf die Oberfläche klicken, das setzt A, B, C; „Drehen“ setzt nichts, das Modell lässt sich also drehen, ohne Marken zu erzeugen. Füllwerkzeug: ein Klick auf eine Oberfläche markiert die ganze zusammenhängende Fläche — und die rechte Taste dreht weiterhin, das Markieren muss dafür nie unterbrochen werden.",
  "help.p3":
    "Punktmarken erkennt man am Buchstaben, markierte Flächen an der Farbe. Für eine getrennte Anmerkung „Neue Fläche“ drücken. Wählen Sie eine Markierung in der Liste, um eine Notiz dazu zu schreiben: was sich dort ändern soll. Markierungen lassen sich rückgängig machen, wiederholen und einzeln löschen.",
  "help.p4":
    "Das Füllwerkzeug zeigt die zusammenhängende, nahezu ebene Fläche und füllt sie auf Klick; der Umfangsregler bestimmt, wie weit diese Fläche reichen darf. Es wirkt auf eine ganze zusammenhängende Oberfläche, auch auf hinter anderen Objekten verborgene Teile. Um eine Füllung zurückzunehmen, machen Sie sie rückgängig oder löschen Sie die Markierung aus der Liste.",
  "help.p5":
    "Markierungen sind am Muster zu unterscheiden und lassen sich mit einem Druck ausblenden; die neutrale Ansicht ist nur eine Sehhilfe. Markierungen bestehen allein in der Durchsicht — die Modelldatei beim Agenten trägt sie nie.",
  "help.p5.named":
    "Markierungen sind am Muster zu unterscheiden und lassen sich mit einem Druck ausblenden; die neutrale Ansicht ist nur eine Sehhilfe. Markierungen bestehen allein in der Durchsicht — die Modelldatei bei {agent} trägt sie nie.",
  "help.p6":
    "„An den Agenten“ speichert und sendet die Markierungen samt Notizen. Was geändert werden soll, können Sie in eine Notiz schreiben oder im ursprünglichen Gespräch sagen – beides zählt; bei Unklarheiten fragt der Agent nach. Das Senden allein ändert das Modell nicht.",
  "help.p6.named":
    "„An {agent}“ speichert und sendet die Markierungen samt Notizen. Was geändert werden soll, können Sie in eine Notiz schreiben oder im ursprünglichen Gespräch sagen – beides zählt; bei Unklarheiten fragt {agent} nach. Das Senden allein ändert das Modell nicht.",
  "help.p7":
    "Die Reiter oben listen jede vom Agenten gelieferte Version. Ein Druck darauf zeigt sie erneut, und Sie können auch auf einer älteren Version direkt markieren und senden — jede Version hat ihren eigenen Entwurf, das Wechseln berührt die anderen nicht. Die Markierungen, die der Agent erhält, nennen die Version, für die sie gelten.",
  "help.p7.named":
    "Die Reiter oben listen jede von {agent} gelieferte Version. Ein Druck darauf zeigt sie erneut, und Sie können auch auf einer älteren Version direkt markieren und senden — jede Version hat ihren eigenen Entwurf, das Wechseln berührt die anderen nicht. Die Markierungen, die {agent} erhält, nennen die Version, für die sie gelten.",
  "help.p8":
    "„An den Agenten“ sendet diesen Stapel; der Agent antwortet mit einer neuen Version, auf der Sie weiter markieren. Es muss nichts abgeschlossen werden, und Entwürfe speichern sich selbst.",
  "help.p8.named":
    "„An {agent}“ sendet diesen Stapel; {agent} antwortet mit einer neuen Version, auf der Sie weiter markieren. Es muss nichts abgeschlossen werden, und Entwürfe speichern sich selbst.",
  "help.p9":
    "GLB, STL und STEP, bis 80 MB und 600.000 Dreiecke. Ein STEP wird beim Eintreffen einmal trianguliert, und Ihre Markierungen liegen auf diesem Netz; heruntergeladen wird weiterhin das STEP selbst. Ein STL trägt keine Farbe und wird daher immer grau gezeigt; Farben kommen mit STEP und GLB. Animation, Skelette und komprimiertes GLB werden noch nicht unterstützt. Dies ist ein Prüfwerkzeug; es modelliert nicht.",
  "help.p10":
    "Messen: Wählen Sie das Messwerkzeug, dann „Punkt zu Punkt“ (Ecken rasten ein), „Kantenlänge“, „Zwei Flächen“ – parallele Flächen ergeben ihren Abstand, alle anderen den Winkel – oder „3-Punkt-Kreis“: Drei Klicks auf den Rand einer Bohrung oder Welle ergeben ihren Durchmesser. Bei einem STEP ist eine Fläche die der Datei selbst, als Ganzes, und eine Kante die Stelle, an der zwei davon zusammentreffen. Millimeter erscheinen mit zwei Nachkommastellen; ein Modell ohne Einheit zeigt nur die Zahl. Eine Messung verschwindet bei der nächsten, außer Sie drücken „Behalten“: Dann wird sie eine Markierung, die Sie beschriften, rückgängig machen, löschen und senden können.",
  "help.p11":
    "Nach „An den Agenten“ zeigen die Zeilen unter der Schaltfläche, wie weit der Stapel ist: wie viele Markierungen gesendet wurden, wann der Agent sie gelesen hat, dann sein Verständnis, das unten rechts am Modell erscheint. Zeigt er auf Stellen am Modell, zeichnet er nur die Umrisse der Bereiche als fließende cyanfarbene Striche mit sanftem Leuchten, über Ihren eigenen Markierungen und ohne Flächenfüllung. Ein neues Echo lässt das Leuchten kurz heller werden; bei reduzierter Bewegung bleibt es statisch. Kann der Agent nicht automatisch benachrichtigt werden, sagt die Leiste das und gibt Ihnen einen Satz, den Sie in sein Gespräch einfügen.",
  "help.p11.named":
    "Nach „An {agent}“ zeigen die Zeilen unter der Schaltfläche, wie weit der Stapel ist: wie viele Markierungen gesendet wurden, wann {agent} sie gelesen hat, dann das Verständnis, das unten rechts am Modell erscheint. Sind Stellen am Modell gemeint, werden nur die Umrisse der Bereiche als fließende cyanfarbene Striche mit sanftem Leuchten gezeichnet, über Ihren eigenen Markierungen und ohne Flächenfüllung. Ein neues Echo lässt das Leuchten kurz heller werden; bei reduzierter Bewegung bleibt es statisch. Kann {agent} nicht automatisch benachrichtigt werden, sagt die Leiste das und gibt Ihnen einen Satz, den Sie in das Gespräch einfügen.",
};
