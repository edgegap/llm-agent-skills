# `assets/client/game-client.js`

Template file. Write the content of the code block below, without the fences, to `game-client.js`.

```js
// Client for the skeleton game in assets/server/game.js: draws the server's snapshot and sends
// inputs. It never decides anything (scores, collisions): that's the server's job.
import * as THREE from "three";
import { runGame, EntityMap, makeLabel, colorOf, smooth, axis } from "./shell.js";

runGame({
  game: "coins", // also the matchmaker profile name
  title: "Coins",
  tagline: "Grab the coin first. First to 10.",
  help: "WASD / arrows move",

  create({ scene, camera, myId, info, input }) {
    const root = new THREE.Group();
    scene.add(root);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(info.half * 2, info.half * 2), new THREE.MeshStandardMaterial({ color: 0x2a3247 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    root.add(floor);
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.15, 24), new THREE.MeshStandardMaterial({ color: 0xffc93c, metalness: 0.6 }));
    coin.rotation.x = Math.PI / 2;
    coin.position.y = 0.7;
    root.add(coin);

    const names = new Map();
    const players = new EntityMap(root, (e) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 0.6, 4, 12), new THREE.MeshStandardMaterial({ color: colorOf(e.id) }));
      body.position.y = 0.8;
      body.castShadow = true;
      const label = makeLabel(names.get(e.id) ?? "");
      label.position.y = 2.1;
      g.add(body, label);
      return g;
    });

    camera.position.set(0, 26, 20);
    camera.lookAt(0, 0, 0);
    let latest = null;
    return {
      state(msg) {
        latest = msg;
        for (const p of msg.players) names.set(p.id, p.name);
      },
      frame(dt) {
        if (!latest) return;
        const t = smooth(dt); // ease toward the server position: hides the 20 Hz updates
        players.sync(latest.s.p, (g, e, fresh) => {
          if (fresh) g.position.set(e.x, 0, e.z);
          g.position.x += (e.x - g.position.x) * t;
          g.position.z += (e.z - g.position.z) * t;
        });
        coin.position.x = latest.s.coin.x;
        coin.position.z = latest.s.coin.z;
        coin.rotation.z += dt * 3;
        input({ mx: axis(["KeyA", "ArrowLeft"], ["KeyD", "ArrowRight"]), mz: axis(["KeyW", "ArrowUp"], ["KeyS", "ArrowDown"]) });
      },
      dispose() {
        scene.remove(root);
      },
    };
  },
});
```
