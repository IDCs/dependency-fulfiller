
### What is this/How does it work ?

This is an experimental Vortex extension which aims to give users the ability to automatically fulfill mod dependencies and/or share mod setups with other Vortex users. This extension allows users to "Export Dependencies" by selecting one or more mods from the mods table (Only mods downloaded through the Nexus Mods website are supported), Vortex will generate a JSON string containing all the information required to download the mods - this data can then be distributed to other users by standard copy-paste - the other users will then need to "Import Dependencies" through the action bar button in the mods page.

![alt text](https://staticdelivery.nexusmods.com/mods/2295/images/225/225-1617393804-228745939.gif "Importing from clipboard")

Alternatively mod authors can distribute a generated dependency file with their mods which will immediately attempt to fulfill mod dependencies on successful mod installation (if the user enables this functionality in their settings page). The "Import Dependencies" button on the mods page can also be used to tell Vortex to search for dependency files within the current game's staging folder and attempt to fulfill them that way (for those of us that prefer full control over when the fulfillment system kicks in)

![alt text](https://staticdelivery.nexusmods.com/mods/2295/images/225/225-1617393804-432707287.gif "Importing from clipboard")

Example data:
```
[
  {
    "archiveName": "BuildShare-5-1-4-0c-1614288309.zip",
    "downloadIds": {
      "fileId": 442,
      "gameId": "valheim",
      "modId": 5
    },
    "allowAutoInstall": true
  },
  {
    "archiveName": "Better Continents-446-0-4-1-1616286717.zip",
    "downloadIds": {
      "fileId": 2343,
      "gameId": "valheim",
      "modId": 446
    },
    "allowAutoInstall": true
  }
]
```

### What it doesn't do:

- Will not export conflict rules
- Will not export mods sourced outside of NexusMods.com
- Will not export mods with orphaned/missing download archives
- Will not export manually added mods unless the mod's metadata is populated (use the "Guess Id" buttons to have Vortex identify your mod and pull the metadata for you)
- The auto-fulfill on install functionality will not use requirements defined within the mod page! (for auto-fulfill to work, the mod needs to have a ".vdeps" file included by the mod author)

### Potential future enhancements:

- Add ability to export/import external dependencies
- Add ability to export mod conflict rules
- A more robust downloading experience for non-premium users
- Add metadata resolution to automatically detect manually added mods (sourced from NexusMods)

If you have any other suggestions feel free to create a github issue for it.
