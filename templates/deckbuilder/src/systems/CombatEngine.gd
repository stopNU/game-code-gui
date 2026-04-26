## CombatEngine — TODO: implement
##
## STUB — must be replaced before any flow constructs it. The advanced-systems
## agent rewrites this entire file in the Phase 2 combat task. Do not leave the
## stub in place: push_error logs in all builds and assert(false) halts the
## debug runtime so the playtest harness fails the moment something calls .new().
extends RefCounted

func _init() -> void:
	push_error("[stub] CombatEngine instantiated but not implemented — fill src/systems/CombatEngine.gd")
	assert(false, "CombatEngine is a stub — implement before instantiation")
