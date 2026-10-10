export default {
  "help.p12":
    "Section view: cut along the model’s canonical X, Y or Z axis (+Z up), set the offset in model units, or flip the removed side. Cut faces are hatched and coloured by part; they are viewing aids and cannot be marked or measured. Remaining front-facing surfaces can still be marked and measured. Section view is a viewing aid only, is never sent to the Agent, and resets when you load another model or version.",
  "help.p12.named":
    "Section view: cut along the model’s canonical X, Y or Z axis (+Z up), set the offset in model units, or flip the removed side. Cut faces are hatched and coloured by part; they are viewing aids and cannot be marked or measured. Remaining front-facing surfaces can still be marked and measured. Section view is a viewing aid only, is never sent to {agent}, and resets when you load another model or version.",

  "help.open": "How to use",
  "help.eyebrow": "QUICK START",
  "help.title": "Look, mark, then say what to change.",
  "help.p1":
    "Right-drag rotates in every tool. Left-drag rotates only in View; marking tools use the left button for their action. Middle-drag, Shift+left/right-drag or Shift+scroll pans. Wheel or pinch zooms. For trackpads and tablets, select Pan (H) and drag to move the view. In View, click or tap a surface to select its part, without leaving a face highlight; click empty space or press Esc to clear. Double-click or double-tap a face to centre rotation there without zooming. Selection creates no mark. On touchscreens, one finger rotates (or pans in Pan); two fingers pan or pinch to zoom. Pan clicks and taps do nothing.",
  "help.p2":
    "Labels: pick the Label tool and click the surface to place A, B, C; the Orbit tool places nothing, so you can turn the model without making marks. Paint bucket: click a surface to mark the whole connected area — and the right button still orbits while you hold it, so marking never has to stop to turn the model.",
  "help.p3":
    "Point labels are identified by their letter, marked areas by their colour. To separate another request, press “New area”. Select a mark in the list to write a note on it: what should change there. You can undo, redo, and delete individual marks.",
  "help.p4":
    "The paint bucket previews the connected near-flat area and fills it on a click; the spread slider sets how far that area may run. It works on a whole connected surface, which can include parts hidden behind other objects. To take a fill back, undo it or delete the mark from the list.",
  "help.p5":
    "Painted marks use a semi-transparent solid colour and an outline, thicker when selected; only section cuts are hatched. Marks can be hidden in one press; plain view is only a viewing aid. Marks live in the review alone — the model file the Agent holds never carries them.",
  "help.p5.named":
    "Painted marks use a semi-transparent solid colour and an outline, thicker when selected; only section cuts are hatched. Marks can be hidden in one press; plain view is only a viewing aid. Marks live in the review alone — the model file {agent} holds never carries them.",
  "help.p6":
    "“Send to Agent” saves and submits the marks with their notes. Say what you want changed in a note or in the original conversation — both count. The Agent first explains its understanding and waits for your confirmation before changing the model. Submitting alone does not change it.",
  "help.p6.named":
    "“Send to {agent}” saves and submits the marks with their notes. Say what you want changed in a note or in the original conversation — both count. {agent} first explains its understanding and waits for your confirmation before changing the model. Submitting alone does not change it.",
  "help.p7":
    "The tabs along the top list currently visible versions. On request, the Agent can hide older versions without deleting their data and restore them later. Press a tab to look back or mark and submit on an older version — each version keeps its own draft, and switching does not affect the others. The marks the Agent receives state which version they target.",
  "help.p7.named":
    "The tabs along the top list currently visible versions. On request, {agent} can hide older versions without deleting their data and restore them later. Press a tab to look back or mark and submit on an older version — each version keeps its own draft, and switching does not affect the others. The marks {agent} receives state which version they target.",
  "help.p8":
    "“Send to Agent” sends this batch; the Agent first explains its understanding, waits for your confirmation, then changes the model and delivers a new version for further marking. Nothing has to be closed off, and drafts save themselves.",
  "help.p8.named":
    "“Send to {agent}” sends this batch; {agent} first explains its understanding, waits for your confirmation, then changes the model and delivers a new version for further marking. Nothing has to be closed off, and drafts save themselves.",
  "help.p9":
    "GLB, glTF, STL and STEP, up to 80 MiB and 600,000 triangles. A STEP is tessellated once when it arrives and your marks land on that mesh; the Agent delivers the original STEP file in the conversation. An STL carries no colour, so it is always drawn grey; colours come with STEP and GLB. Draco and Meshopt compression are supported; animation and skeletons are not supported yet. This is a review tool; it does not sculpt the model.",
  "help.p9.named":
    "GLB, glTF, STL and STEP, up to 80 MiB and 600,000 triangles. A STEP is tessellated once when it arrives and your marks land on that mesh; {agent} delivers the original STEP file in the conversation. An STL carries no colour, so it is always drawn grey; colours come with STEP and GLB. Draco and Meshopt compression are supported; animation and skeletons are not supported yet. This is a review tool; it does not sculpt the model.",
  "help.p10":
    "Measure starts in Smart: click an edge, hole or face; click a second one to compare. Nearby corners snap first, then edges, then faces. A straight edge shows its length. On STEP, one click on a circular edge or cylindrical wall shows the diameter; an arc also shows radius and angle. Corners, straight edges and flat faces pair in any combination: a distance is measured square to the edge or face, and edges or faces that are not parallel give their angle instead. An angle involving an edge is shown but cannot be kept; pairs with a curve say so. The third click starts over; Escape clears the reading. Advanced opens the original four kinds, including 3-point circle for STL/GLB. Noncircular STEP curves show approximate tessellated length only and cannot be kept. Values use model units and the usual decimals. Keep makes the reading a mark you can note, undo, delete and send.",
  "help.p11":
    "After “Send to Agent” the lines under the button follow the batch: how many marks were sent, then when the Agent read them, then its understanding, which appears at the bottom right of the model. Where it points at places on the model, it draws flowing cyan dashes with a soft glow along the region outlines, above your own marks without filling the regions. A new echo briefly brightens the glow; with reduced motion enabled, it stays still. If the Agent cannot be told automatically, the panel says so and gives you a sentence to paste into its conversation.",
  "help.p11.named":
    "After “Send to {agent}” the lines under the button follow the batch: how many marks were sent, then when {agent} read them, then its understanding, which appears at the bottom right of the model. Where it points at places on the model, it draws flowing cyan dashes with a soft glow along the region outlines, above your own marks without filling the regions. A new echo briefly brightens the glow; with reduced motion enabled, it stays still. If {agent} cannot be told automatically, the panel says so and gives you a sentence to paste into its conversation.",
};
