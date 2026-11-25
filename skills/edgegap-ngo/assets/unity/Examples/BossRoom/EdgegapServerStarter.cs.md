# `assets/unity/Examples/BossRoom/EdgegapServerStarter.cs`

Template file. Write the content of the code block below, without the fences, to `EdgegapServerStarter.cs`.

```csharp
using System;
using System.Collections;
using System.Collections.Generic;
using Unity.BossRoom.ConnectionManagement;
using UnityEngine;

namespace Unity.Multiplayer.Samples.BossRoom
{
    public class EdgegapServerStarter : MonoBehaviour
    {
        public string portMapName = "gameport";

        // Start is called before the first frame update
        void Start()
        {
            if (Application.isBatchMode)
            {
                ConnectionManager connectionManager = GameObject.Find("ConnectionManager").GetComponent<ConnectionManager>();
                string internalPortAsStr = Environment.GetEnvironmentVariable($"ARBITRIUM_PORT_{portMapName.ToUpper()}_INTERNAL");

                ushort port;
                if (internalPortAsStr == null)
                {
                    // Not on Edgegap (local run or docker run): use EdgegapSettings.ListenPort or -edgegapListenPort.
                    port = EdgegapBootstrap.Settings != null ? EdgegapBootstrap.Settings.ListenPort : (ushort)9998;
                    Debug.LogWarning($"No ARBITRIUM_PORT_{portMapName.ToUpper()}_INTERNAL, not on Edgegap: listening on port {port}.");
                }
                else if (!ushort.TryParse(internalPortAsStr, out port))
                {
                    throw new Exception($"Could not find port mapping, make sure your app version port name matches with \"{portMapName}\"");
                }

                Debug.Log($"Edgegap Server | Starting server on 0.0.0.0:{port}.");
                connectionManager.StartHostIp("SERVER", "0.0.0.0", port);
            }
        }
    }
}
```
