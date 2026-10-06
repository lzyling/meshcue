/* Français. Les noms d'outils restent courts parce qu'ils se suivent dans une
   barre : « Gomme », pas « Outil gomme ». */
export default {
  "agent.withTool": "{name} ({tool})",

  "app.tagline": "Revue et annotation de modèles 3D",
  "app.version": "Version en cours",
  "app.updateHint":
    "La version {version} est disponible. Demandez à votre agent de mettre à jour MeshCue.",
  "app.updateHint.named":
    "La version {version} est disponible. Demandez à {agent} de mettre à jour MeshCue.",

  "closing.pending":
    "Cette revue n'a pas servi depuis un moment et va se fermer. Toute action ici la maintient ouverte.",
  "closing.done":
    "Fermée après une longue inactivité. Toutes les versions et les annotations enregistrées sont conservées : demandez à l'agent de rouvrir cette revue pour continuer.",
  "closing.done.named":
    "Fermée après une longue inactivité. Toutes les versions et les annotations enregistrées sont conservées : demandez à {agent} de rouvrir cette revue pour continuer.",
  "common.close": "Fermer",
  "common.version": "Version",

  "conn.connecting": "Connexion",
  "conn.origin": "Répond dans la conversation d'origine",
  "conn.collect": "L'agent vient les chercher ici",
  "conn.collect.named": "{agent} vient les chercher ici",
  "conn.local": "Revue locale",
  "conn.returnToChat": "Revenir à la conversation d'origine",
  "conn.paused": "Connexion en pause",
  "conn.accessExpired": "Accès expiré · brouillon conservé",
  "conn.noAccess": "Pas encore d'accès à la revue",
  "conn.reclaimed": "Revue fermée · annotations enregistrées",
  "conn.offline": "Le service est hors ligne",
  "conn.connectedNoAccess":
    "Connecté à l'atelier ; aucun modèle ne sera chargé avant l'octroi de l'accès.",
  "conn.dropped":
    "La connexion au service a été perdue ; votre brouillon est conservé.",
  "conn.actionFailed": "L'action n'a pas abouti.",
  "conn.noSecureRandom":
    "Ce navigateur n'a pas de source aléatoire sécurisée. Veuillez utiliser une version récente de Chrome ou d'Edge.",

  "error.empty": "Posez d'abord un repère ou peignez une zone",
  "error.saving":
    "Attendez la fin de l'enregistrement du brouillon avant d'envoyer",
  "error.staleDraft":
    "Le brouillon a changé ; rechargez la version enregistrée",
  "error.originBusy": "Une autre conversation utilise cette revue en ce moment",
  "error.accessExpired":
    "Cette autorisation à usage unique a expiré ; revenez à la conversation",
  "error.accessLimit": "Cette revue a atteint sa limite de connexions",
  "error.integrationDisabled":
    "MeshCue est désactivé ; votre brouillon est conservé, continuez dans la conversation",
  "error.deliveryUnconfirmed":
    "Livraison non confirmée ; vos marques sont enregistrées et seront réessayées",
  "error.accessRequired":
    "Cette entrée n'a pas d'accès de revue valide. Veuillez revenir à la conversation d'origine.",

  "a11y.reviewPanel": "Revue du modèle",
  "a11y.versionTabs": "Versions du modèle",
  "a11y.toolbar": "Outils du modèle",
  "a11y.palette": "Couleur de marquage",
  "a11y.viewer": "Aperçu du modèle 3D — pivoter, zoomer et annoter",

  "model.awaiting": "En attente du modèle livré par l'Agent",
  "model.awaiting.named": "En attente du modèle livré par {agent}",
  "model.awaitingFirst": "En attente du premier modèle livré par l'Agent",
  "model.awaitingFirst.named": "En attente du premier modèle livré par {agent}",
  "model.triangles": "{count} triangles",
  "model.summary": "{count} triangles · {format} · {units}",
  "units.unspecified": "sans unité",
  "model.readFailed": "Impossible de lire le fichier du modèle.",
  "model.versionMismatch":
    "Le fichier ne correspond pas à la version indiquée par l'Agent ; marquage interrompu.",
  "model.versionMismatch.named":
    "Le fichier ne correspond pas à la version indiquée par {agent} ; marquage interrompu.",
  "model.noExtent": "Le modèle n'a aucune étendue affichable.",
  "model.animated":
    "Exportez d'abord un maillage statique ; cette version n'annote pas les animations déformantes.",
  "model.tooManyTriangles":
    "Le modèle dépasse 600 000 triangles. Simplifiez-le d'abord.",
  "model.meshOverBudget":
    "Le maillage de revue dépasse la limite de 600 000 triangles. Simplifiez d'abord le modèle.",
  "model.contextLost":
    "Le contexte d'affichage a été perdu ; votre brouillon est conservé. Veuillez recharger la page.",

  "save.preparing": "Préparation",
  "save.saving": "Enregistrement…",
  "save.saved": "Brouillon enregistré",
  "save.verifying": "Vérification…",
  "save.restoring": "Restauration du brouillon…",
  "save.notStarted": "Aucun marquage",
  "save.unsynced": "Non synchronisé · brouillon sur cette machine",
  "save.storageFull":
    "Le stockage local est plein. Laissez cette page ouverte pour que le serveur puisse enregistrer.",

  "loading.preparing": "Préparation de l'espace de revue",
  "loading.verifying": "Chargement et vérification de la version du modèle",
  "loading.rebuildingMesh": "Recalcul du maillage de revue ({count} triangles)",
  "loading.hint":
    "Vous pourrez commencer à marquer dès que le modèle sera chargé",

  "view.plain": "Vue neutre",
  "view.original": "Couleurs d'origine",

  "cube.front": "AVANT",
  "cube.back": "ARRIÈRE",
  "cube.right": "DROITE",
  "cube.left": "GAUCHE",
  "cube.top": "DESSUS",
  "cube.bottom": "DESSOUS",
  "cube.viewFrom": "Vue depuis {side}",
  "cube.sideJoin": "-",
  "cube.homeTitle": "Revenir à la vue par défaut",
  "cube.homeLabel": "Réinitialiser la vue",
  "cube.widgetLabel":
    "Cube de vue ; clic droit ou appui long pour la vue par défaut",
  "cube.defaultMenu": "Vue par défaut",
  "cube.setDefault": "Définir la vue actuelle par défaut",
  "cube.resetDefault": "Réinitialiser la vue par défaut",

  "tool.orbit": "Pivoter",
  "tool.orbitLabel": "Outil pivoter",
  "tool.orbitTitle": "Tourner et examiner le modèle ; rien n'est posé ni peint",
  "tool.label": "Repère",
  "tool.labelLabel": "Outil repère",
  "tool.labelTitle":
    "Cliquez une surface pour poser un repère ; le bouton droit pivote",
  "hint.label":
    "Cliquez une surface pour poser un repère · le bouton droit pivote toujours",
  "tool.bucket": "Remplir",
  "tool.bucketLabel": "Outil pot de peinture",
  "tool.bucketTitle":
    "Prévisualise la zone contiguë quasi plane ; un clic la remplit",
  "tool.undo": "Annuler",
  "tool.undoTitle": "Annuler Ctrl/⌘ Z",
  "tool.redo": "Rétablir",
  "tool.marks": "Marques",
  "tool.plain": "Neutre",
  "tool.spread": "Étendue",
  "tool.bucketSpread": "Étendue du remplissage",
  "tool.newRegion": "Nouvelle zone",
  "tool.newRegionHint":
    "Le prochain remplissage formera sa propre zone de couleur.",
  "hint.orbit":
    "Clic pour sélectionner · double-clic pour centrer · glisser pour tourner · Déplacer (H) · molette/pincement pour zoomer",
  "hint.fill":
    "Survoler pour prévisualiser · cliquer pour remplir · le bouton droit pivote toujours",
  "hint.relocate": "Cliquez une surface pour déplacer le repère · Échap annule",

  "settings.language": "Langue de l'interface",
  "settings.theme": "Clair ou sombre",
  "settings.themeSystem": "Suivre le système",
  "settings.themeLight": "Clair",
  "settings.themeDark": "Sombre",

  "tool.measure": "Mesurer",
  "tool.measureLabel": "Outil de mesure",
  "tool.measureTitle":
    "Mesure entre deux points, le long d'une arête, entre deux faces ou le diamètre d'un cercle ; rien n'est gardé sans « Garder »",
  "hint.measurePoints":
    "Cliquez deux points · les coins s'aimantent · le bouton droit pivote toujours",
  "hint.measureEdge":
    "Pointez une arête droite et cliquez pour lire sa longueur · le bouton droit pivote toujours",
  "hint.measurePlanes":
    "Cliquez une face plane, puis une autre · le bouton droit pivote toujours",
  "hint.measureCircle":
    "Cliquez trois points sur le bord d'un trou ou d'un arbre · les coins s'aimantent · le bouton droit pivote toujours",
};
