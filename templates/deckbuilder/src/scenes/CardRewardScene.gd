## TODO: implement this scene
##
## STUB — must be replaced before any run flow reaches it. The advanced-gameplay
## agent rewrites this entire file in the Phase 6 scene-UI task. Do not leave
## the stub in place: push_error logs in all builds and assert(false) halts the
## debug runtime so the playtest harness fails loudly instead of silently
## displaying an empty scene.
extends Node

const _SCENE_NAME := "CardRewardScene"

func _ready() -> void:
	push_error("[stub] %s reached but not implemented — fill src/scenes/%s.gd" % [_SCENE_NAME, _SCENE_NAME])
	assert(false, "%s is a stub — implement before any flow can reach this scene" % _SCENE_NAME)
