export default {
  "help.p12":
    "Section view: cut along the model’s X, Y or Z axis, set the offset in model units, or flip the removed side. The amber cut face is a viewing aid and cannot be marked or measured. Remaining front-facing surfaces can still be marked and measured. Section view is a viewing aid only, is never sent to the Agent, and resets when you load another model or version.",
  "help.p12.named":
    "Section view: cut along the model’s X, Y or Z axis, set the offset in model units, or flip the removed side. The amber cut face is a viewing aid and cannot be marked or measured. Remaining front-facing surfaces can still be marked and measured. Section view is a viewing aid only, is never sent to {agent}, and resets when you load another model or version.",

  "help.open": "How to use",
  "help.eyebrow": "QUICK START",
  "help.title": "Look, mark, then say what to change.",
  "help.p1":
    "Right-drag to orbit, wheel or pinch to zoom toward the pointer, middle-drag or Shift+wheel to pan — on a mouse or trackpad. In the Orbit tool, left-drag also rotates; Shift+left-drag or Shift+right-drag pans. Marking tools keep the left button for marks. On a touchscreen, drag one finger to rotate and use two fingers to pinch or pan; these gestures never mark. A tap places nothing in Orbit; with Label, Paint bucket or Measure selected, tap the surface to use that tool. For trackpad-only panning, select Pan (H) and click-drag. Pan also moves the view with one finger on touchscreens; clicks and taps do not select or place marks. Shift+two-finger scroll/drag or middle-drag also pans in every tool.",
  "help.p2":
    "Labels: pick the Label tool and click the surface to place A, B, C; the Orbit tool places nothing, so you can turn the model without making marks. Paint bucket: click a surface to mark the whole connected area — and the right button still orbits while you hold it, so marking never has to stop to turn the model.",
  "help.p3":
    "Point labels are identified by their letter, marked areas by their colour. To separate another request, press “New area”. Select a mark in the list to write a note on it: what should change there. You can undo, redo, and delete individual marks.",
  "help.p4":
    "The paint bucket previews the connected near-flat area and fills it on a click; the spread slider sets how far that area may run. It works on a whole connected surface, which can include parts hidden behind other objects. To take a fill back, undo it or delete the mark from the list.",
  "help.p5":
    "Marks are told apart by pattern and can be hidden in one press; plain view is only a viewing aid. Marks live in the review alone — the model file the Agent holds never carries them.",
  "help.p5.named":
    "Marks are told apart by pattern and can be hidden in one press; plain view is only a viewing aid. Marks live in the review alone — the model file {agent} holds never carries them.",
  "help.p6":
    "“Send to Agent” saves and submits the marks with their notes. Say what you want changed in a note or back in the original conversation — both count; the Agent will ask if anything is unclear. Submitting does not change the model by itself.",
  "help.p6.named":
    "“Send to {agent}” saves and submits the marks with their notes. Say what you want changed in a note or back in the original conversation — both count; {agent} will ask if anything is unclear. Submitting does not change the model by itself.",
  "help.p7":
    "The tabs along the top list every version the Agent has delivered. Press any of them to look back, and you can mark and submit on an older version directly — each version keeps its own draft, and switching does not affect the others. The marks the Agent receives state which version they target.",
  "help.p7.named":
    "The tabs along the top list every version {agent} has delivered. Press any of them to look back, and you can mark and submit on an older version directly — each version keeps its own draft, and switching does not affect the others. The marks {agent} receives state which version they target.",
  "help.p8":
    "“Send to Agent” sends this batch; the Agent replies with a new version and you carry on marking that one. Nothing has to be closed off, and drafts save themselves.",
  "help.p8.named":
    "“Send to {agent}” sends this batch; {agent} replies with a new version and you carry on marking that one. Nothing has to be closed off, and drafts save themselves.",
  "help.p9":
    "GLB, glTF, STL and STEP, up to 80 MB and 600,000 triangles. A STEP is tessellated once when it arrives and your marks land on that mesh; downloading still gives you the STEP itself. An STL carries no colour, so it is always drawn grey; colours come with STEP and GLB. Draco and Meshopt compression are supported; animation and skeletons are not supported yet. This is a review tool; it does not sculpt the model.",
  "help.p10":
    "Measure starts in Smart: click an edge, hole or face; click a second one to compare. Nearby corners snap first, then edges, then faces. A straight edge shows its length. On STEP, one click on a circular edge or cylindrical wall shows the diameter; an arc also shows radius and angle. Two corners give distance; two flat faces give gap when parallel, otherwise angle. Unsupported pairs say so. The third click starts over; Escape clears the reading. Advanced opens the original four kinds, including 3-point circle for STL/GLB. Noncircular STEP curves show approximate tessellated length only and cannot be kept. Values use model units and the usual decimals. Keep makes the reading a mark you can note, undo, delete and send.",
  "help.p11":
    "After “Send to Agent” the lines under the button follow the batch: how many marks were sent, then when the Agent read them, then its understanding, which appears at the bottom right of the model. Where it points at places on the model, it draws flowing cyan dashes with a soft glow along the region outlines, above your own marks without filling the regions. A new echo briefly brightens the glow; with reduced motion enabled, it stays still. If the Agent cannot be told automatically, the panel says so and gives you a sentence to paste into its conversation.",
  "help.p11.named":
    "After “Send to {agent}” the lines under the button follow the batch: how many marks were sent, then when {agent} read them, then its understanding, which appears at the bottom right of the model. Where it points at places on the model, it draws flowing cyan dashes with a soft glow along the region outlines, above your own marks without filling the regions. A new echo briefly brightens the glow; with reduced motion enabled, it stays still. If {agent} cannot be told automatically, the panel says so and gives you a sentence to paste into its conversation.",
};
