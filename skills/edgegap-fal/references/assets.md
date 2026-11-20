# fal assets for a game that goes online

Done for Relic Rumble on 2026-11-17 with fal's `genmedia` CLI 0.7.1 driven by a coding agent. The fal MCP server (`https://mcp.fal.ai/mcp-relay`, OAuth sign-in, tools `search_models`, `get_pricing`, `run_model`, `submit_job`, `check_job`, `get_job_result`) reaches the same models; it was not used for this run. Model ids and prices change: check them (`genmedia models`, `genmedia pricing <id>`, or the MCP's `search_models` / `get_pricing`) before quoting a cost.

## The one rule

Assets belong to the page. The server runs `client/rules.js`, where a character is a circle and a wall is a box. So:
- no asset is copied into the server image (`server/Dockerfile` copies `server/` and `client/rules.js` only);
- changing or adding art never needs a server build, an app version or a matchmaker change;
- collisions, reach and speeds are numbers in `rules.js`, never read from a model. Size the model to the rule (a pillar model is scaled to its 2.2 × 2.2 box), not the rule to the model.

## Connecting the agent to fal

| Way | Setup | Notes |
|---|---|---|
| `genmedia` CLI | The developer installs it (genmedia.sh) and runs `genmedia setup` with an API key they create at fal.ai/dashboard/keys (the "API" preset is enough; give it an expiry) | The agent then runs `genmedia run ... --json`. The key never goes through chat. On Windows the binary is in `%LOCALAPPDATA%\genmedia\bin`, which a Git Bash session may not have on its PATH. |
| fal MCP | `claude mcp add --transport http --scope user fal https://mcp.fal.ai/mcp-relay` then `/mcp` to sign in; `codex mcp add fal --url https://mcp.fal.ai/mcp-relay` then `codex mcp login fal` | OAuth, no key. A server added mid-session may only show up in a new session. |

A new fal account can have no usable balance: every call answers `403 User is locked. Reason: Exhausted balance`. Only the developer can add credit (fal.ai/dashboard/billing). Give them the estimate first.

## What Relic Rumble used

| Asset | Model | List price (2026-11-17) |
|---|---|---|
| Concept images, floor texture | `fal-ai/nano-banana-2`, 1:1, 1K | $0.08 per image |
| 3D models, with rigging for characters | `meshy/v7.1/image-to-3d` | $0.80 per model |
| Sound effects | `elevenlabs/sound-effects/v3` | $0.002 per second |

8 images, 7 models and about 6 seconds of sound: about $6.30. A Meshy job took a few minutes; submit them with `--async` and poll, several at once.

## Characters: image, then rigged GLB

1. **Concept image.** One shared style paragraph for every character, then one line each, so they look like one cast:

   > Stylized chunky low-poly toy character for a 3D party game, full body from head to feet, standing in an A-pose with arms held slightly away from the body and legs apart, facing the camera, front view, clearly separated arms and legs, big head, short limbs, simple shapes, flat matte colors with soft shading, no weapons, no props in hands, no cape, plain white background, single character centered, no text. Character: [one line].

   Full body, A-pose, separated limbs, empty hands and no cape are for the auto-rigger. Look at each image before paying for the 3D step.
2. **Image to 3D with rigging.**

   ```bash
   genmedia run meshy/v7.1/image-to-3d --image_url "<concept url>" --enable_rigging true --pose_mode "a-pose" \
     --target_polycount 12000 --rigging_height_meters 1.7 --async --json
   genmedia status meshy/v7.1/image-to-3d <request_id> --result --json
   ```

   The result holds `rigged_character_glb` (skinned model, about 3.5 MB, one 2048 px texture) and `basic_animations.walking_armature_glb` / `running_armature_glb`: the walk and run clips alone, about 85 KB each. There is no idle clip unless you ask for one (`enable_animation` with `animation_action_id: 0`); Relic Rumble fades back to the rest pose when a character stands still. All four characters rigged on the first try, a robot and a goblin included.
3. **Download** only from the URLs in the result (`*.fal.media`), into a folder that is not served, then **shrink**: `gltf-transform resize --width 1024 --height 1024` and `gltf-transform webp` took each model from about 3.5 MB to 1.3 MB without touching the mesh or the skin. Three.js's `GLTFLoader` reads WebP textures as is. Don't use mesh compression (Draco, Meshopt) unless the page also loads the decoder.

Props are the same two steps without rigging and with `--target_polycount 4000` (about 400 KB each after shrinking).

## Loading them in Three.js

The sample's [`client/render.js`](https://github.com/edgegap/netcode-sample-fal-relic-rumble/blob/main/client/render.js) is the reference. The parts that go wrong:

- **Scaling a rigged model.** A rigged GLB's nodes carry their own scale (Meshy's armature is 0.01, the mesh is in centimetres). `new THREE.Box3().setFromObject(model)` then returns a box about 100 times too small or too big and the character renders as a dot. Use the precise form, which measures the skinned vertices: `model.updateMatrixWorld(true); box.setFromObject(model, true)`. Scale to a height in world units, then put the box's bottom on the floor and wrap the model in a `Group` you move and rotate.
- **Clips in separate files.** Load the model GLB and each clip GLB, rename the clip (`walk`, `run`) and play it on a mixer made for the model: the bone names match, so it applies as is. The model's own animation list has a zero-length rest clip; skip clips with `duration === 0`.
- **Several players, one model.** Clone with `SkeletonUtils.clone(scene)` (three.js's helper for skinned models; a plain `scene.clone()` does not rebind the skeleton). One `AnimationMixer` per clone.
- **Culling.** The sample sets `frustumCulled = false` on skinned meshes as a precaution: their bounding sphere comes from the rest pose, not the animated one.
- **Animation from movement.** Pick idle, walk or run from the speed the character actually moves on screen (the eased position online), and scale the clip's `timeScale` with it so feet don't slide much.
- **Readable gameplay.** A generated relic on a generated floor is hard to see. Keep game-state cues in code: a team-coloured ring under each character, a glowing disc under a free relic, a coloured zone around each goal.
- **Fallbacks.** Each loader call catches its error and leaves the plain shape in place: a missing file must not stop the game.

## Images and sounds

- A floor or wall texture: ask for "seamless tileable texture, top-down orthographic view, even lighting, no shadows, no objects", save as JPEG, set `RepeatWrapping`. Tone it down with the material colour if it fights with the characters.
- Sounds: one short clip per rules event (`pickup`, `score`, `shove`, `hit`, `win`), `--duration_seconds` 0.5 to 3, `--output_format mp3_44100_64`. The page plays them from the events `step()` returns in solo and the server forwards online, so both modes sound the same. Create the `AudioContext` on the first button click, not on load.
- 2D games: fal's `fal-gamedev` and `game-asset-production` skills make sprite sheets; the same rules apply (frame geometry in the page, hit boxes in `rules.js`).

## Before publishing the page

- Total size: Relic Rumble's `client/assets/` is 7 MB (four characters, three props, floor, sounds). List big files and shrink again if a phone on mobile data should load it.
- Keep `PROMPTS.md`: model, prompt and price per asset.
- Generated media has terms: point the developer to fal's and each model's licence before they ship a product with it. Don't prompt for a named franchise's characters.
