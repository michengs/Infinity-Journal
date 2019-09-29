const fs = require('fs')
const path = require('path')

const ITEM_ATLAS   = [222675] // 旅行者之書：地區移動
const ITEM_JOURNAL = [222674] // 旅行者之書：村莊移動

const specialCases = {
	"7015": 71001,
	"7013": 75001,
	"7021": 80001,
	"7022": 79001,
	"7023": 77001
}

module.exports = function InfinityJournal(mod) {
	const CONTRACT_ATLAS = (mod.majorPatchVersion >= 85 ? 55 : 54)
	
	let currentContract = null,
		teleportingTo = null,
		
		serverLocations = [],
		customLocations = [],
		slotAtlas = -1,
		slotJournal = -1,
		newCustom = '',
		hold = false
	
	try {
		customLocations = JSON.parse(fs.readFileSync(path.join(__dirname, 'journal.json'), "utf8"))
	} catch(e) {
		
	}
	
	mod.command.add('opij', () => {
		mod.send('C_USE_PREMIUM_SLOT', 1, slotAtlas)
	})
	
	mod.command.add(['journal', 'ij'], (name, province) => {
		if (!currentContract || currentContract.type != CONTRACT_ATLAS) {
			message('"地区移动书" 开启状态才能保存 自定义位置')
			return false
		}
		
		newCustom = name
		if (province) newCustom += '\t' + province
		
		mod.send('C_ADD_TELEPORT_TO_POS_LIST', 1, {
			name: '*\t*'
		})
	})
	
	mod.command.add('hold', () => {
		hold = !hold
		message('Hold is now: ' + hold)
	})
	
	mod.command.add('unhold', () => {
		mod.send('S_ADMIN_HOLD_CHARACTER', 2, {
			hold: false
		})
		message('Un-Holded')
	})
	
	mod.game.on('enter_game', () => {
		currentContract = teleportingTo = null
	})

	mod.hook('S_REQUEST_CONTRACT', 1, (event) => {
		currentContract = event
	})
	
	mod.hook('S_CANCEL_CONTRACT', 1, (event) => {
		currentContract = null
	})
	
	mod.hook('S_ACTION_END', 5, (event) => {
		if (event.gameId == mod.game.me.gameId && event.type != 37) {
			teleportingTo = currentContract = null
		}
	})
	
	mod.hook('C_TELEPORT_TO_POS', 1, (event) => {
		if (event.index >= serverLocations.length) {
			if (slotAtlas !== -1) {
				teleportingTo = customLocations[event.index - serverLocations.length]
// mod.log(teleportingTo)
				mod.send('C_USE_PREMIUM_SLOT', 1, slotAtlas)
				
				mod.setTimeout(()=> {
					mod.send('C_USE_PREMIUM_SLOT', 1, slotJournal)
					if (!teleportingTo) message('传送至 ' + teleportingTo.name)
				, 2000})
			} else {
				message('未检测到 "旅行者之書：地區移動"')
				return false
			}
			message('')
		}
	})
	
	mod.hook('C_DELETE_TELEPORT_TO_POS_LIST', 1, (event) => {
		if (event.index >= serverLocations.length) {
			message('已删除 ' + customLocations[event.index - serverLocations.length].name)
			
			customLocations.splice(event.index - serverLocations.length, 1)
			
			saveCustom()
			mod.send('S_LOAD_TELEPORT_TO_POS_LIST', 1, {
				locations: serverLocations.concat(getCustomLocations())
			})
			return false
		}
	})
	
	mod.hook('S_PREMIUM_SLOT_DATALIST', 2, (event) => {
// mod.log(event)
		slotAtlas = -1
		slotJournal = -1
		for (let set of event.sets) {
// mod.log(set.inventory)
			for (let inv of set.inventory) {
				if (ITEM_ATLAS.includes(inv.id)) {
					slotAtlas = {
						set: set.id,
						slot: inv.slot,
						type: inv.type,
						id: inv.id
					}
				}
				if (ITEM_JOURNAL.includes(inv.id)) {
					slotJournal = {
						set: set.id,
						slot: inv.slot,
						type: inv.type,
						id: inv.id
					}
				}
			}
		}
	})
	
	mod.hook('S_LOAD_TELEPORT_TO_POS_LIST', 1, (event) => {
		for (let i = 0; i < event.locations.length; i++) {
			let loc = event.locations[i]
			if (loc.name == '*\t*') {
				if (newCustom) {
					customLocations.push({
						zone: loc.zone,
						x: loc.x,
						y: loc.y,
						z: loc.z,
						name: newCustom
					})
					customLocations.sort((a, b) => a.name.localeCompare(b.name))
					saveCustom()
					message('已保存位置 ' + newCustom)
					newCustom = ''
				}
				mod.send('C_DELETE_TELEPORT_TO_POS_LIST', 1, {
					index: i
				})
				event.locations.splice(i, 1) // Never display temporary entries
				i--
			} else {
				loc.name += ' *' // Mark server per-character locations as different from custom shared ones
			}
		}
		
		serverLocations = event.locations
		event.locations = event.locations.concat(getCustomLocations())
		return true
	})
	
	mod.hook('S_VILLAGE_LIST_TO_TELEPORT', 1, (event) => {
		if (teleportingTo) {
			for (let loc of event.locations) {
				if (loc.zone == teleportingTo.zone || specialCases[teleportingTo.zone]) {
					mod.send('C_TELEPORT_TO_VILLAGE', 1, {
						id: specialCases[teleportingTo.zone] ? specialCases[teleportingTo.zone] : loc.id
					})
					return false
				}
			}
			message('Zone ' + teleportingTo.zone + ' not found in Village Atlas')
			teleportingTo = null
		}
	})
	
	mod.hook('S_LOAD_TOPO', 3, (event) => {
		if (teleportingTo) {
			event.loc.x = teleportingTo.x
			event.loc.y = teleportingTo.y
			event.loc.z = teleportingTo.z
			return true
		}
	})
	
	mod.hook('S_SPAWN_ME', 3, (event) => {
		if (teleportingTo) {
			event.loc.x = teleportingTo.x
			event.loc.y = teleportingTo.y
			event.loc.z = teleportingTo.z
			return true
			if (hold) {
				process.nextTick(() => {
					mod.send('S_ADMIN_HOLD_CHARACTER', 2, {
						hold: true
					})
				})
			}
		}
	})
	
	function getCustomLocations() {
		let custom = []
		for (let l of customLocations) {
			custom.push({
				unk: 0,
				zone: l.zone,
				x: l.x,
				y: l.y,
				z: l.z,
				name: l.name.includes('\t') ? l.name : l.name + '\t'
			})
		}
		return custom
	}
	
	function saveCustom() {
		fs.writeFileSync(path.join(__dirname, 'journal.json'), JSON.stringify(customLocations, null, '    '))
	}
	
	function message(msg) {
		mod.command.message(msg)
	}
}