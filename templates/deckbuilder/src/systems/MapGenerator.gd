## MapGenerator — TODO: implement
##
## STUB — must be replaced before any flow constructs it. The advanced-systems
## agent rewrites this entire file in the Phase 4 map task. Do not leave the
## stub in place: push_error logs in all builds and assert(false) halts the
## debug runtime so the playtest harness fails the moment something calls .new().
extends RefCounted

func _init() -> void:
	push_error("[stub] MapGenerator instantiated but not implemented — fill src/systems/MapGenerator.gd")
	assert(false, "MapGenerator is a stub — implement before instantiation")
