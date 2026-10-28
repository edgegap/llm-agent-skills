class_name EdgegapFindMatchButton
extends Button

## A drop-in FIND MATCH / CANCEL button: queues on the Edgegap matchmaker, then
## joins the assigned server on the SceneTree's MultiplayerAPI. Add it to any
## menu from code (`menu.add_child(EdgegapFindMatchButton.new())`) or as a
## node, and point status_label at a Label to show progress.
##
## The game reacts to multiplayer.connected_to_server as it does for any other
## join. If the game has its own join function (with name or lobby fields),
## set join_callable instead: it receives the address dictionary from
## EdgegapMatchmaker.address_from_assignment. Fill every field that function
## validates first: a join refused by the game's own validation fails silently
## and the player looks stuck "searching".
##
## EDGEGAP_FIND_MATCH=1 presses the button once at launch, for scripted tests.

@export var status_label: Label
var join_callable: Callable
var matchmaker: EdgegapMatchmaker


func _ready() -> void:
	text = "FIND MATCH"
	matchmaker = EdgegapMatchmaker.new()
	matchmaker.name = "EdgegapMatchmaker"
	add_child(matchmaker)
	matchmaker.status_changed.connect(_on_status)
	matchmaker.assigned.connect(_on_assigned)
	pressed.connect(_on_pressed)
	disabled = not EdgegapGameSettings.is_matchmaker_configured()
	_show("Ready." if not disabled else "Matchmaker not configured.")
	if OS.get_environment("EDGEGAP_FIND_MATCH") == "1" and not disabled:
		_on_pressed.call_deferred()


func _on_pressed() -> void:
	if matchmaker.is_searching():
		matchmaker.cancel()
	else:
		matchmaker.find_match()


func _on_status(state: EdgegapMatchmaker.State, message: String) -> void:
	_show(message)
	match state:
		EdgegapMatchmaker.State.IDLE, EdgegapMatchmaker.State.JOINED:
			text = "FIND MATCH"
			disabled = false
		EdgegapMatchmaker.State.CREATING, EdgegapMatchmaker.State.SEARCHING:
			text = "CANCEL"
			disabled = false
		_:
			text = "PLEASE WAIT"
			disabled = true


func _on_assigned(address: Dictionary) -> void:
	if join_callable.is_valid():
		join_callable.call(address)
	else:
		matchmaker.join(address, multiplayer)


func _show(message: String) -> void:
	print("EDGEGAP_MM status=\"%s\"" % message)
	if status_label != null:
		status_label.text = message
