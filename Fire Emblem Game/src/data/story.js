/* ------------------------------------------------------------------
   STORY TEXT — first pass, entirely rewritable.
   Nothing in the engine depends on any string in this file.
------------------------------------------------------------------ */
(function (FE) {
  'use strict';

  FE.STORY = {
    title: 'THE SUNDERED CROWN',
    subtitle: 'A tactics campaign in the Aurelund marches',

    intro: [
      { who: '', text: 'AURELUND. Three generations after a war nobody won.' },
      { who: '', text: 'The old crown of Estrel was broken into three pieces and divided among the three powers, so that no one king could be crowned, and no one king could march.' },
      { who: '', text: 'Varn has quietly gathered two of the three.' },
      { who: '', text: 'The last piece rests in the reliquary at Greywater, on a quiet border that has been quiet for forty years.' },
      { who: '', text: 'It stops being quiet tonight.' }
    ],

    chapters: {
      ch1: {
        name: 'Greywater Burns',
        pre: [
          { who: 'Alaric', text: 'Seren. The household guard is at muster and the outer yard is already alight. Those are not bandits — bandits do not come for a reliquary.' },
          { who: 'Seren', text: 'Then we hold the stair with what we have.' },
          { who: 'Alaric', text: 'No. You go. Dorn, Bram — take her out through the west gate and do not stop for me.' },
          { who: 'Dorn', text: '...My lord.' },
          { who: 'Seren', text: 'Father —' },
          { who: 'Alaric', text: 'Go, girl. Somebody has to still be a Valehart in the morning.' }
        ],
        post: [
          { who: 'Seren', text: 'He had my father’s signet. A brigand chief out of Caldmark, carrying a Valehart seal.' },
          { who: 'Dorn', text: 'Somebody paid him to be here. Somebody who knew the guard would be at muster.' },
          { who: 'Mira', text: 'And the reliquary?' },
          { who: 'Seren', text: 'Empty. They were three hours ahead of us.' },
          { who: 'Rook', text: 'East, if you’re asking. Everything out of Greywater goes east over Ardwyn Crossing. Not that I’d know.' }
        ],
        objectiveText: 'Defeat every enemy on the field.'
      },
      ch2: {
        name: 'Ardwyn Crossing',
        pre: [
          { who: 'Edran', text: 'Far as the bridge and no further. Those are Varn regulars on the gate, not hired knives — they’re not pretending anymore.' },
          { who: 'Seren', text: 'Captain Coyle. My father’s contract with your company —' },
          { who: 'Edran', text: 'Is unfulfilled. I know. That’s why I’m still standing here and not three counties south.' },
          { who: 'Halvard', text: 'The crossing is Imperial ground as of dawn. Step onto it and I will treat you as I am ordered to.' }
        ],
        post: [
          { who: 'Seren', text: 'Imperial ground. As of dawn. On a border Varn signed forty years ago.' },
          { who: 'Edran', text: 'Somebody opened that gate from your side, my lady. Regulars don’t cross a treaty line on a whim.' },
          { who: 'Seren', text: 'Then we find out who. East, and keep off the roads.' }
        ],
        objectiveText: 'Move Seren onto the gate to seize it.'
      },
      ch3: {
        name: 'The Ashmoor Line',
        pre: [
          { who: 'Ilya', text: 'Wyverns. Varn’s southern flight, and we are in the open on a moor.' },
          { who: 'Seren', text: 'How long until your relief column?' },
          { who: 'Ilya', text: 'Ten turns of the glass. Hold the old signal fort and they will find us. Fail to hold it and they will find pieces.' },
          { who: 'Sirin', text: 'Hold your line if you like. I have until the tenth bell and no longer.' }
        ],
        post: [
          { who: 'Ilya', text: 'She broke off. She had us and she broke off.' },
          { who: 'Seren', text: 'She had orders and a clock. That is not a raid, Ilya. That is a campaign with a schedule.' },
          { who: 'Dorn', text: 'Then somebody wrote the schedule. We should like to meet them.' }
        ],
        objectiveText: 'Survive 10 turns. Do not let Seren fall.'
      },
      ch4: {
        name: 'The Ashfold',
        pre: [
          { who: 'Edran', text: 'The Ashfold keeps the marches\u2019 records. Every land grant, every levy roll, every writ your father ever sealed.' },
          { who: 'Seren', text: 'Then it keeps a copy of whatever was sealed the night Greywater burned.' },
          { who: 'Edran', text: 'It did. The brothers have been selling the archive by the crate for two years.' },
          { who: 'Ansel', text: 'The order kept nothing here worth dying for. I checked. Repeatedly.' }
        ],
        post: [
          { who: 'Corin', text: 'The writ is gone \u2014 Ansel sold it eight months ago. But I copy everything before it leaves. Habit.' },
          { who: 'Seren', text: 'Show me.' },
          { who: 'Corin', text: 'A safe-conduct across Ardwyn Crossing. Issued to Varn. Sealed with the Valehart signet.' },
          { who: 'Dorn', text: 'Your father never signed that.' },
          { who: 'Corin', text: 'No. The hand is the castellan\u2019s. Emory Thane.' },
          { who: 'Seren', text: '...He taught me to ride.' }
        ],
        objectiveText: 'Defeat Brother Ansel.'
      },
      ch5: {
        name: 'Salt Marsh Road',
        pre: [
          { who: 'Edran', text: 'Kerr\u2019s company. Free swords out of the salt country \u2014 he underbid me for your father\u2019s contract two winters back and has never once let it go.' },
          { who: 'Seren', text: 'Can you buy him?' },
          { who: 'Edran', text: 'Somebody already has. That is the trouble with the honest ones.' },
          { who: 'Roald', text: 'Coyle. You always did take the work that paid in gratitude.' }
        ],
        post: [
          { who: 'Yrsa', text: 'You want to know who writes the orders. I carried them for nine months.' },
          { who: 'Seren', text: 'Then say a name.' },
          { who: 'Yrsa', text: 'I never saw one. But every packet came up the Thane road, and every packet was already sealed when it reached Varn.' },
          { who: 'Edran', text: 'Sealed by whom?' },
          { who: 'Yrsa', text: 'By somebody on your side of the border, captain. That is the entire point of a traitor.' }
        ],
        objectiveText: 'Seize the marsh gate.'
      },
      ch6: {
        name: "The Thane's Gate",
        pre: [
          { who: 'Seren', text: 'He built this keep. He built ours. The same hall, the same blind south wall.' },
          { who: 'Dorn', text: 'Then you know the ground better than he thinks you do.' },
          { who: 'Emory', text: 'Seren. Turn around and I will let every one of them walk.' },
          { who: 'Seren', text: 'Say it out loud first. Say what you did.' },
          { who: 'Emory', text: 'Your father would not bend and so your father is ash. I bent. Greywater still stands.' }
        ],
        post: [
          { who: 'Seren', text: 'Greywater still stands. He actually believed that was an argument.' },
          { who: 'Edran', text: 'He believed it was a price. Men like that always know exactly what they paid.' },
          { who: 'Odile', text: 'My lady. Thane\u2019s ledger \u2014 the last entry is a shipment, not a payment. Crown-piece, crated, going out through Gallows Harbour on the turn of the month.' },
          { who: 'Seren', text: 'How long is that?' },
          { who: 'Odile', text: 'Six days. And the tide does not wait for grief.' }
        ],
        objectiveText: 'Defeat Emory Thane.'
      },
      ch7: {
        name: 'Gallows Harbour',
        pre: [
          { who: 'Rook', text: 'Gallows takes Varn coin to sink Varn\u2019s competition. Drusa runs the quay and the quay runs everything.' },
          { who: 'Seren', text: 'And the crate?' },
          { who: 'Rook', text: 'On the water by dusk, if we are slow. In a hold we cannot reach, if we are polite.' },
          { who: 'Drusa', text: 'Harbour\u2019s mine. Tide\u2019s mine. You are standing in both.' }
        ],
        post: [
          { who: 'Kell', text: 'Crate\u2019s still on the boards. Never made the hold.' },
          { who: 'Seren', text: 'Open it.' },
          { who: 'Kell', text: '...It is full of ballast stone, my lady. Weighed to the ounce.' },
          { who: 'Edran', text: 'Then the real one went out earlier, quietly, on something nobody would search.' },
          { who: 'Seren', text: 'Or it never came here at all, and Thane sold us a route the way he sold my father a gate.' }
        ],
        objectiveText: 'Defeat Captain Drusa.'
      },
      ch8: {
        name: 'The Broken Oath',
        pre: [
          { who: 'Ilya', text: 'That is the southern flight. All of it. They are not hunting us \u2014 they are hunting one of their own.' },
          { who: 'Seren', text: 'Sirin Vale.' },
          { who: 'Oren', text: 'Vale. You were given a clock and a line. You have broken both.' },
          { who: 'Sirin', text: 'I was given a schedule, Marshal. I have finally read the rest of it.' }
        ],
        post: [
          { who: 'Sirin', text: 'The crown piece never went to the coast. It went up the Kestrel road under a grain writ, and I flew escort for it without being told what I was escorting.' },
          { who: 'Seren', text: 'Where does the Kestrel road end?' },
          { who: 'Sirin', text: 'Varn. The capital. The forge where they are putting the three pieces back together.' },
          { who: 'Dorn', text: 'Then there is no more chasing. There is only the road in.' },
          { who: 'Seren', text: 'Good. I am tired of arriving late.' }
        ],
        objectiveText: 'Defeat Wing-Marshal Oren.'
      },
      ch9: {
        name: 'The Grain Road',
        pre: [
          { who: 'Sirin', text: 'Grain writ, four wagons, no escort worth the name. That is how it crossed four border posts without one of them opening a crate.' },
          { who: 'Seren', text: 'And nobody thought to look?' },
          { who: 'Sirin', text: 'Everybody thought to look. Nobody is paid to be right about a quartermaster.' },
          { who: 'Bern', text: 'Flour, barley, salt, and one crate nobody is paid enough to ask about. Move along.' }
        ],
        post: [
          { who: 'Seren', text: 'Empty. Again. He was moving the writ, not the crate.' },
          { who: 'Talis', text: 'Then the crate went up the old road, past the Cinderwatch. I have been watching that road for a year, and for a year it has been on fire.' },
          { who: 'Edran', text: 'Forests do not burn for a year.' },
          { who: 'Talis', text: 'They do if somebody keeps lighting them.' }
        ],
        objectiveText: 'Seize the waystation gate.'
      },
      ch10: {
        name: 'Cinderwatch',
        pre: [
          { who: 'Talis', text: 'Watchtower in the middle, and everything for two miles around it burnt flat. You can see a rider coming from anywhere. That is the point.' },
          { who: 'Seren', text: 'They burnt their own forest to get a clear field.' },
          { who: 'Malken', text: 'Dace! You swore the same oath I did. Get off that horse and remember it.' },
          { who: 'Roswyn', text: 'I remember it perfectly, Malken. That is the difficulty.' }
        ],
        post: [
          { who: 'Roswyn', text: 'Twenty years I held this watch. The order came down last spring: clear the approaches, whatever stands on them.' },
          { who: 'Seren', text: 'Villages.' },
          { who: 'Roswyn', text: 'Four. I carried the order as far as the first one and then I did not carry it any further.' },
          { who: 'Dorn', text: 'And the crate?' },
          { who: 'Roswyn', text: 'Went east, to the Ember Cloister. They are not hiding it, my lady. They are having it *authenticated*.' }
        ],
        objectiveText: 'Defeat Ser Malken.'
      },
      ch11: {
        name: 'The Ember Cloister',
        pre: [
          { who: 'Thessaly', text: 'You are three hours early and the wrong army entirely. Come in and shut the gate.' },
          { who: 'Seren', text: 'Who is out there?' },
          { who: 'Thessaly', text: 'The Ecclesiastical Office, with torches. We hold the only complete record of how the crown was broken and who agreed to it. That is the sort of thing an empire tidies.' },
          { who: 'Reyl', text: 'Three pieces, one crown, and one very tidy history in which it was never broken at all.' }
        ],
        post: [
          { who: 'Thessaly', text: 'The archive stands. So do most of the brothers, which I did not expect at this hour.' },
          { who: 'Seren', text: 'Then tell me what the record says.' },
          { who: 'Thessaly', text: 'That the crown was broken by agreement, and that the agreement names three houses. Estrel. Varn. And Valehart.' },
          { who: 'Seren', text: '...My family held a piece.' },
          { who: 'Thessaly', text: 'Your family held the *agreement*. That is why they came for your father, and that is why they will not stop at the gate.' }
        ],
        objectiveText: 'Hold the cloister for 12 turns.'
      },
      ch12: {
        name: 'The Kestrel Gate',
        pre: [
          { who: 'Edran', text: 'One road through, walls on both sides, and a Grand Marshal sitting on it. There is no clever way to do this one.' },
          { who: 'Seren', text: 'Then we do it the other way.' },
          { who: 'Solk', text: 'You are four chapters and one army short of the capital, girl. I will wait for you there.' },
          { who: 'Dorn', text: 'He means it. He will not die for a gate he has already lost.' }
        ],
        post: [
          { who: 'Seren', text: 'He rode off. He did not even leave a rearguard, he just... left.' },
          { who: 'Roswyn', text: 'That is Solk. He spends nothing he does not have to. It is the only thing about him worth admiring.' },
          { who: 'Thessaly', text: 'And now the pass is yours, and the capital is nine days ahead, and they know precisely when you will arrive.' },
          { who: 'Seren', text: 'Good. I have spent this entire war arriving late. Let them wait on me for once.' }
        ],
        objectiveText: 'Seize the gate with Seren.'
      },
      ch13: {
        name: 'The North Road',
        pre: [
          { who: 'Roswyn', text: 'That is the North Army drawn up across nine miles of open ground. Ide does not ambush. He simply stands where you have to be.' },
          { who: 'Seren', text: 'Then he has told us exactly where he will be.' },
          { who: 'Roswyn', text: 'Yes. He considers that fair.' },
          { who: 'Corran', text: 'Nine days of road and an army at the end of it. You were always going to arrive tired.' }
        ],
        post: [
          { who: 'Edran', text: 'That was the field army. All of it. There is nothing between us and the walls now but Solk.' },
          { who: 'Seren', text: 'Solk is not nothing.' },
          { who: 'Thessaly', text: 'No. But he is one man with a river, and he has already decided once that you were not worth dying for.' },
          { who: 'Dorn', text: 'He will not decide that twice.' }
        ],
        objectiveText: 'Defeat Field-Marshal Corran.'
      },
      ch14: {
        name: "Solk's Line",
        pre: [
          { who: 'Solk', text: 'I told you I would wait. I did not say I would be glad of it.' },
          { who: 'Seren', text: 'You could stand aside. You are good at arithmetic \u2014 do it again.' },
          { who: 'Solk', text: 'I have. The bridge is two tiles wide and you are in a hurry. The numbers are better than you think.' },
          { who: 'Edran', text: 'He is not wrong, my lady.' }
        ],
        post: [
          { who: 'Seren', text: 'He held to the last man and the last man was him.' },
          { who: 'Roswyn', text: 'He was the best soldier Varn had. He spent his whole career being handed orders written by people who were not.' },
          { who: 'Thessaly', text: 'The walls are open, my lady. The outer wards are three streets deep and full of people who have not been told there is a war.' },
          { who: 'Seren', text: 'Then we go through them carefully. I did not come nine hundred miles to do to them what was done to Greywater.' }
        ],
        objectiveText: 'Seize the throne with Seren.'
      },
      ch15: {
        name: 'The Outer Wards',
        pre: [
          { who: 'Rook', text: 'Streets. Proper streets, with corners. I would like it on record that this is my sort of ground and nobody else\u2019s.' },
          { who: 'Bellis', text: 'You brought an army into a street. I only need the street.' },
          { who: 'Seren', text: 'She is right. Tighten up. Nobody chases anybody down an alley.' }
        ],
        post: [
          { who: 'Ivane', text: 'You are the Valehart heir, you are standing in my city, and you have not burned any of it. That is three surprises before breakfast.' },
          { who: 'Seren', text: 'And you are the emperor\u2019s sister.' },
          { who: 'Ivane', text: 'I am the emperor\u2019s archivist, which is worse. I have read the third seal of the agreement. My brother has read it too. He simply prefers the other two.' },
          { who: 'Thessaly', text: 'Say what it holds, child.' },
          { who: 'Ivane', text: 'That the crown may only be rejoined by the consent of all three houses \u2014 and that if it is rejoined without them, it is not a crown. It is just a heavy circle of metal with a very expensive lie welded into it.' }
        ],
        objectiveText: 'Clear the ward.'
      },
      ch16: {
        name: 'The Forge',
        pre: [
          { who: 'Ivane', text: 'Down and left. The forge has been running eleven years and Vahl has not left it in three.' },
          { who: 'Seren', text: 'Eleven years. My father was alive for nine of those.' },
          { who: 'Ivane', text: 'Your father was written to for seven of them. He said no every time. That is the whole reason for Greywater, my lady \u2014 not the piece. The refusal.' },
          { who: 'Vahl', text: 'Another hour. One more hour and there is no crown to argue over, only a crown.' }
        ],
        post: [
          { who: 'Seren', text: 'It is done. It is finished. Three pieces, one crown, sitting there on the anvil like a hat.' },
          { who: 'Ivane', text: 'Without the third consent. Which makes it \u2014' },
          { who: 'Seren', text: 'Mine to give or refuse. That is what he wanted from my father. That is what he will want from me.' },
          { who: 'Thessaly', text: 'He is upstairs, my lady. He has been upstairs the entire time, waiting for somebody to bring him the last signature.' },
          { who: 'Dorn', text: 'Then he has been waiting eleven years to meet a Valehart who says no.' },
          { who: 'Seren', text: 'He has met two. Let us go and be the second.' }
        ],
        objectiveText: 'Defeat Magister Vahl.'
      },
      ch17: {
        name: 'The Sealed Level',
        pre: [
          { who: 'Ivane', text: 'They have dropped the doors. All four of them. Nobody is going upstairs and nobody is going down.' },
          { who: 'Rook', text: 'Chains. Big ones. Give me twelve turns and I will have the postern open, and do not stand near me while I do it.' },
          { who: 'Seren', text: 'Twelve turns with the Household coming down two stairwells at us.' },
          { who: 'Dorn', text: 'Two stairwells is two doorways. I have held worse with less.' },
          { who: 'Draugh', text: 'Nobody carries that off this level. Not you, not the Magister, not his own sister.' },
          { who: 'Seren', text: 'Then we are not carrying it anywhere. We are standing on it. Backs to the anvil \u2014 hold the mouths and let them come to us.' }
        ],
        post: [
          { who: 'Rook', text: 'Open. I would like it noted that I did that under fire and nobody thanked me.' },
          { who: 'Mira', text: 'Thank you, Rook.' },
          { who: 'Rook', text: 'Not from you, it doesn\u2019t count, you thank the kettle.' },
          { who: 'Ivane', text: 'Down and west from here is the cistern stair. It is the only way up that is not a killing floor.' },
          { who: 'Seren', text: 'You say that like the cistern stair is good news.' },
          { who: 'Ivane', text: 'I say it like it is the other one.' }
        ],
        objectiveText: 'Hold the forge chamber for twelve turns.'
      },
      ch18: {
        name: 'The Water Stair',
        pre: [
          { who: 'Ivane', text: 'Cisterns. Four of them, and the whole level runs on the sluices. Keep off the water \u2014 it is deeper than a man and colder than it looks.' },
          { who: 'Ilya', text: 'It is dark down here. I cannot see the far bank at all.' },
          { who: 'Thessaly', text: 'There is a torch staff in the strongroom, if anyone fancies being a lamp.' },
          { who: 'Veyn', text: 'Open the gates and let it in. They can swim to him if they want him so badly.' },
          { who: 'Seren', text: 'He will flood the lower city to keep one stair dry.' },
          { who: 'Ivane', text: 'He will flood the lower city because somebody wrote him an order that says he may. That is the whole empire in one sentence, my lady.' }
        ],
        post: [
          { who: 'Seren', text: 'The sluices are shut. Nobody drowns tonight.' },
          { who: 'Ivane', text: 'Above us is the Hall of Consents. It is where every treaty Varn has ever signed was signed, and the Marshal will be standing in it, because that is where he thinks the argument still is.' },
          { who: 'Dorn', text: 'And is it?' },
          { who: 'Ivane', text: 'It was. Eleven years ago it was. Nobody has told Aurick Strade.' }
        ],
        objectiveText: 'Take the cistern gate.'
      },
      ch19: {
        name: 'The Hall of Consents',
        pre: [
          { who: 'Strade', text: 'Far enough. You are Alaric\u2019s second child and you are standing in the room where your grandfather put his name to the sundering. I would like you to look at it before we do this.' },
          { who: 'Seren', text: 'I am looking.' },
          { who: 'Strade', text: 'Sign it and I will stand my flights down within the hour. That is not a threat, girl. It is the only offer anyone here will make you.' },
          { who: 'Seren', text: 'You have been fighting his wars for thirty years. Do you know what the third seal says?' },
          { who: 'Strade', text: '...No.' },
          { who: 'Seren', text: 'His sister does. She is behind me with a tome in her hand. Ask her, or get out of the aisle.' },
          { who: 'Strade', text: 'I am sixty-one years old and I have never once been out of the aisle. Come on, then.' }
        ],
        post: [
          { who: 'Strade', text: 'Ah. That was \u2014 that was well struck.' },
          { who: 'Seren', text: 'Lie still.' },
          { who: 'Strade', text: 'The blade in the west chest. Dawnmarch. They forged it out of the offcut when they broke the crown, and then they pretended there had not been an offcut. Take it up with him. He will know what it is the moment he sees it.' },
          { who: 'Ivane', text: 'He will. He had it made.' },
          { who: 'Dorn', text: 'The dais stair is clear, my lady.' },
          { who: 'Seren', text: 'Then that is the last of them. Ivane \u2014 last chance to stay down here.' },
          { who: 'Ivane', text: 'He is my brother. I have been on the stair the whole time; I was just reading while I waited.' }
        ],
        objectiveText: 'Defeat the Lord Marshal.'
      },
      ch20: {
        name: 'The Last Signature',
        pre: [
          { who: 'Dravan', text: 'You came all this way to refuse me in person. I find that almost affectionate.' },
          { who: 'Seren', text: 'You burned Greywater for a signature.' },
          { who: 'Dravan', text: 'I wrote to your father for seven years. Politely. He answered every letter and he answered no every time, and never once told me why, which I thought was very rude of a man who had read the same seal I had.' },
          { who: 'Ivane', text: 'He did tell you why. You did not like the answer.' },
          { who: 'Dravan', text: 'Hello, Ivane. You have been reading again.' },
          { who: 'Ivane', text: 'The third consent is not a formality, Dravan. It is the whole mechanism. A crown joined by two is not a crown joined \u2014 it is a claim held open by force, and it has to be held open by force for as long as it is worn.' },
          { who: 'Dravan', text: 'Yes. I know. I have arranged the force.' },
          { who: 'Seren', text: 'Dorn. Everyone. He is not going to be talked down.' },
          { who: 'Dorn', text: 'He has been waiting eleven years to meet a Valehart who says no.' },
          { who: 'Seren', text: 'He has met two.' }
        ],
        post: [
          { who: 'Seren', text: 'It is over. He is \u2014 it is over.' },
          { who: 'Ivane', text: 'Take it off him.' },
          { who: 'Seren', text: 'Ivane.' },
          { who: 'Ivane', text: 'Take it off him, Seren. Somebody has to be holding it when the sun comes up, and there is nobody left in this room it can belong to except you.' },
          { who: 'Thessaly', text: 'Three pieces. Two consents. And the third standing here with it in her hands.' },
          { who: 'Dorn', text: 'Your father never got this far, my lady. Whatever you do next, he never got to choose.' }
        ],
        objectiveText: 'Defeat the Emperor.'
      }
    },

    /* mid-battle scenes, fired by the engine rather than the chapter flow */
    scenes: {
      ch20_crown: [
        { who: 'Dravan', text: 'No. No, I am not \u2014 not to a provincial girl with her father\u2019s manners.' },
        { who: 'Ivane', text: 'Dravan. Do not. You have read what it does to the one who wears it unconsented \u2014' },
        { who: 'Dravan', text: 'I have read it more carefully than you. It holds. It only has to hold until there is nobody left who remembers the third.' },
        { who: 'Seren', text: 'He is putting it on.' },
        { who: 'Ivane', text: 'Then stop talking and put him down, because in about four seconds he stops being my brother.' }
      ]
    },

    /* the epilogue: the third consent is Seren's to give or refuse */
    epilogue: {
      prompt: 'The crown is whole, and in your hands. Two of the three houses set their names to the joining. The third is yours.',
      question: 'What does Seren do?',
      choices: [
        { key: 'refuse', label: 'Refuse. Break it again.',
          blurb: 'Three realms, three thrones, and no crown for anyone to march behind.' },
        { key: 'consent', label: 'Consent. Set your name to it.',
          blurb: 'One crown, whole and lawful, on the head of the one house that never wanted it.' }
      ],
      refuse: [
        { who: 'Seren', text: 'Hold it on the anvil, Dorn.' },
        { who: 'Dorn', text: 'My lady \u2014' },
        { who: 'Seren', text: 'Hold it on the anvil.' },
        { who: '', text: 'She broke it with the Marshal\u2019s own hammer, in front of nine witnesses, and made every one of them sign what they had seen.' },
        { who: 'Ivane', text: 'Do you understand what you have just cost your own house? Estrel could have had all of it.' },
        { who: 'Seren', text: 'Estrel had all of it once. That is why there was a war nobody won.' },
        { who: '', text: 'Varn kept its throne and lost its appetite. Estrel kept its river marches and its pegasi and stopped being useful to everyone. Caldmark went back to selling axes to both.' },
        { who: '', text: 'Ivane Kesk rebuilt the imperial archive from memory and published the third seal in full, which took her nine years and cost her the last of her family.' },
        { who: '', text: 'Greywater was rebuilt with Varn money, badly, and then again with its own, properly. Seren Valehart never took a crown and was never once, in forty years, asked to.' },
        { who: 'Dorn', text: 'He would have been proud of that, my lady. The refusal. It was always the refusal.' }
      ],
      consent: [
        { who: 'Seren', text: 'Bring me a pen and the third seal. The real one, Ivane, not the copy.' },
        { who: 'Ivane', text: 'You are going to sign it.' },
        { who: 'Seren', text: 'I am going to rewrite it and then sign it. Three signatures, three thrones, and the crown kept by the house that has no army \u2014 so it can be worn by nobody and refused by anybody.' },
        { who: 'Ivane', text: 'That is not how a crown works.' },
        { who: 'Seren', text: 'It is now. Who is going to argue? Everyone who would have is on the floor behind me.' },
        { who: '', text: 'The Accord of the Forge was signed at dawn by Seren Valehart, by Ivane Kesk for Varn, and \u2014 after eleven weeks of being shouted at \u2014 by the clan moot of Caldmark.' },
        { who: '', text: 'The crown sits whole in a plain room in Greywater with one door and no guard. Three keys, three houses, and any one of them may say no.' },
        { who: '', text: 'It has been said no to twice since. Both times it held.' },
        { who: 'Dorn', text: 'Your father said no for seven years and got a burned house for it. You said yes once and got the same thing he wanted.' },
        { who: 'Seren', text: 'I got his answer, Dorn. I just found a longer way to write it.' }
      ]
    },

    /* Talk conversations: keyed "speakerId>targetId" */
    talks: {
      'seren>rook': [
        { who: 'Seren', text: 'You are not swinging at me.' },
        { who: 'Rook', text: 'Observant. No. Gorr pays in promises and I’ve stopped eating those.' },
        { who: 'Seren', text: 'And what do I pay in?' },
        { who: 'Rook', text: 'Nothing yet. But your house has a reliquary, and I have a very particular set of hands. Point me at a locked thing.' },
        { who: 'Seren', text: '...Get behind Dorn.' }
      ],
      'seren>cass': [
        { who: 'Cass', text: 'Stop. You’re the Valehart girl.' },
        { who: 'Seren', text: 'I am.' },
        { who: 'Cass', text: 'Then Varn is paying me to kill the last person in Aurelund who has a reason to fight them. That’s poor accounting.' },
        { who: 'Seren', text: 'What is your name?' },
        { who: 'Cass', text: 'Cass. That’s all of it you get for now.' }
      ],
      'seren>garrick': [
        { who: 'Garrick', text: 'Caldmark doesn’t fight children.' },
        { who: 'Seren', text: 'Caldmark took Varn’s coin.' },
        { who: 'Garrick', text: 'Caldmark took Varn’s coin and then Caldmark watched what the coin was for. I gave it back this morning. Loudly.' },
        { who: 'Seren', text: 'Then pick a side of the fort and stand on it.' }
      ],
      'bram>nessa': [
        { who: 'Bram', text: 'You’re the poacher. We’ve been looking for you for six years.' },
        { who: 'Nessa', text: 'You’ve been looking badly.' }
      ],
      'seren>corin': [
        { who: 'Corin', text: 'Do not \u2014 I am not with him. I am the one who kept being told to stop asking where the crates went.' },
        { who: 'Seren', text: 'And did you stop?' },
        { who: 'Corin', text: 'I stopped asking. I did not stop copying.' },
        { who: 'Seren', text: 'Then get behind the line and keep your book dry.' }
      ],
      'mira>corin': [
        { who: 'Mira', text: 'Brother. You are bleeding into your own archive.' },
        { who: 'Corin', text: 'It is a very dull chapter. Are you a healer or a critic?' },
        { who: 'Mira', text: 'Both. Come here.' }
      ],
      'seren>yrsa': [
        { who: 'Yrsa', text: 'Stop there. I have nothing left worth taking.' },
        { who: 'Seren', text: 'You have a Varn field cloak and no Varn behind you.' },
        { who: 'Yrsa', text: 'I carried their post for nine months. Then I read a packet I was not meant to open, and now I live in a marsh.' },
        { who: 'Seren', text: 'Come with me and you can read the next one out loud.' }
      ],
      'petra>yrsa': [
        { who: 'Petra', text: 'Is that dark magic? Actual dark magic? The Academy said it was extinct.' },
        { who: 'Yrsa', text: 'The Academy says a great many restful things.' },
        { who: 'Petra', text: 'Teach me. Immediately. Please.' },
        { who: 'Yrsa', text: '...Get in line behind the war, girl.' }
      ],
      'seren>odile': [
        { who: 'Odile', text: 'Valehart. Before you swing \u2014 I am the one who sewed your shieldbearer\u2019s arm shut at Ardwyn. He did not notice.' },
        { who: 'Seren', text: 'You are Halvard\u2019s sister.' },
        { who: 'Odile', text: 'I am. He died holding a bridge he had been ordered to hold by a man who was selling it. I would like to meet that man.' },
        { who: 'Seren', text: 'He is upstairs. Ride with me.' }
      ],
      'mira>odile': [
        { who: 'Mira', text: 'You have a surgeon\u2019s kit and a horse. That is unfair.' },
        { who: 'Odile', text: 'It is efficient. You may borrow the horse.' },
        { who: 'Mira', text: 'I will borrow the horse.' }
      ],
      'seren>kell': [
        { who: 'Kell', text: 'Not my fight, my lady. I rob Varn ships. Drusa robs whoever pays.' },
        { who: 'Seren', text: 'Drusa is being paid by Varn.' },
        { who: 'Kell', text: '...Say that again slowly, because if it is true I have been robbing my own side for three years.' }
      ],
      'rook>kell': [
        { who: 'Rook', text: 'Bosun. It is me.' },
        { who: 'Kell', text: 'It is. You owe me a boat.' },
        { who: 'Rook', text: 'I owe you half a boat. Come and take it off the Valehart girl\u2019s payroll.' }
      ],
      'seren>talis': [
        { who: 'Talis', text: 'Close enough. State your business with the road.' },
        { who: 'Seren', text: 'I am chasing a grain wagon that is not carrying grain.' },
        { who: 'Talis', text: 'Then you are the first person on this road in a year with an honest reason to be on it.' },
        { who: 'Seren', text: 'Does that get me your bow?' },
        { who: 'Talis', text: 'It gets you my attention. The bow follows shortly after, historically.' }
      ],
      'nessa>talis': [
        { who: 'Nessa', text: 'That is a Kestrel road draw. Nobody teaches that this far west.' },
        { who: 'Talis', text: 'Nobody teaches it anywhere. You watch a wyvern come at you twice and you invent it.' },
        { who: 'Nessa', text: 'Show me.' },
        { who: 'Talis', text: 'After. There is one coming now and you are standing in my line.' }
      ],
      'seren>roswyn': [
        { who: 'Roswyn', text: 'Valehart. I am not going to fight you, and I am not going to help you either, so we have a problem.' },
        { who: 'Seren', text: 'You are sitting alone in a burnt forest in Varn colours. You already have a problem.' },
        { who: 'Roswyn', text: '...That is fair.' },
        { who: 'Seren', text: 'Malken is going to burn the next village too. I am going to stop him. You can decide on the way.' }
      ],
      'dorn>roswyn': [
        { who: 'Dorn', text: 'Dace. Ardwyn, thirty-one years ago. You were on the far bank.' },
        { who: 'Roswyn', text: 'I remember a shieldbearer who would not move. For six hours.' },
        { who: 'Dorn', text: 'Seven.' },
        { who: 'Roswyn', text: 'Seven. Get out of my way, Hollis, I am joining your army.' }
      ],
      'seren>thessaly': [
        { who: 'Thessaly', text: 'You are the Valehart girl. You are shorter than the letters implied.' },
        { who: 'Seren', text: 'What letters?' },
        { who: 'Thessaly', text: 'Your father wrote to this house for eleven years. I will show you, once the people currently setting fire to it have stopped.' }
      ],
      'corin>thessaly': [
        { who: 'Corin', text: 'Abbess. The Ashfold is gone. Ansel sold it crate by crate and I could not stop him.' },
        { who: 'Thessaly', text: 'Brother Ashe. Did you copy the writs before they went?' },
        { who: 'Corin', text: 'All of them.' },
        { who: 'Thessaly', text: 'Then the Ashfold is not gone. It is standing next to me holding a very heavy bag.' }
      ],
      'mira>thessaly': [
        { who: 'Mira', text: 'You have a Mend staff and I have been healing a war with a Heal.' },
        { who: 'Thessaly', text: 'Then you have been doing three times the work for a third of the result. Come here, child, I am going to teach you something unkind about thrift.' }
      ],
      'seren>ivane': [
        { who: 'Ivane', text: 'Stop. Look at the colours before you swing \u2014 nobody in this city wears grey but the archive.' },
        { who: 'Seren', text: 'You are not a soldier.' },
        { who: 'Ivane', text: 'I am a reasonably good one, which is not the same thing. Ivane Kesk. Yes, that Kesk. No, I am not going to fight you about it.' },
        { who: 'Seren', text: 'Then what do you want?' },
        { who: 'Ivane', text: 'Somebody to read the third seal out loud in front of my brother. I have been carrying it for six years and I am tired.' }
      ],
      'thessaly>ivane': [
        { who: 'Thessaly', text: 'Archivist. Your office burned my cloister last month.' },
        { who: 'Ivane', text: 'My office. Not me. I am the one who sent you the warning, abbess, four days before Reyl arrived.' },
        { who: 'Thessaly', text: '...The unsigned one.' },
        { who: 'Ivane', text: 'They are all unsigned. That is rather the point of me.' }
      ],
      'petra>ivane': [
        { who: 'Petra', text: 'You are riding a horse and holding a tome. At the same time. Is that allowed?' },
        { who: 'Ivane', text: 'It is extremely not allowed and I have been doing it for six years.' },
        { who: 'Petra', text: 'Teach me everything immediately.' }
      ],
      'seren>sirin': [
        { who: 'Sirin', text: 'Valehart. Do not mistake this for rescue \u2014 they are here for me, not you.' },
        { who: 'Seren', text: 'At Ashmoor you had us and you broke off.' },
        { who: 'Sirin', text: 'I had a clock. I have since read what the clock was counting down to.' },
        { who: 'Seren', text: 'Then land, Wing-Captain, and tell me on the ground.' },
        { who: 'Sirin', text: 'Vale. Just Vale now. The rank went with the oath.' }
      ]
    },

    villages: {
      ch2_north: {
        lines: [
          { who: 'Villager', text: 'Take it, my lady \u2014 my brother\u2019s, from the old war. It bites through plate. You will want it before you reach that gate.' }
        ],
        gift: 'armorslayer', gold: 0
      },
      ch2_south: {
        lines: [
          { who: 'Nessa', text: 'You’re the Valehart heir, and you’re standing in my house.' },
          { who: 'Seren', text: 'You’ve been stealing my family’s deer.' },
          { who: 'Nessa', text: 'Six years. Want them back, or want somebody who can put an arrow through a wyvern’s eye at forty paces?' }
        ],
        recruit: 'nessa'
      },
      ch1_house: {
        lines: [{ who: 'Steward', text: 'The strongbox, my lady — it is all we saved. Go, before they come round the stable.' }],
        gold: 2000
      },
      ch4_croft: {
        lines: [
          { who: 'Villager', text: 'The brothers stopped feeding us when the crates started leaving. Take the ring \u2014 it came out of one of them, and I would rather it went somewhere useful.' }
        ],
        gift: 'energyring', gold: 600
      },
      ch5_ferryman: {
        lines: [
          { who: 'Villager', text: 'Kerr\u2019s lot took my punt and left me this. Draws like a whip and I am seventy years old. You take it.' }
        ],
        gift: 'killerbow', gold: 400
      },
      ch6_west: {
        lines: [
          { who: 'Villager', text: 'Thane\u2019s tithe collectors have been through twice this month. There is nothing left but the strongbox they missed.' }
        ],
        gold: 3000
      },
      ch6_east: {
        lines: [
          { who: 'Steward', text: 'My lady \u2014 I served your father, and the castellan sent me here to be quiet. The armoury key, and my apologies for twenty years of it.' }
        ],
        gift: 'silversword', gold: 0
      },
      ch7_dockhand: {
        lines: [
          { who: 'Villager', text: 'Drusa keeps the crates in the west warehouse and the keys on her belt. This one is spare. She does not know I have it.' }
        ],
        gift: 'chestkey', gold: 1200
      },
      ch9_carter: {
        lines: [
          { who: 'Villager', text: 'Wagons every week and not one of them stops. Take the ring \u2014 fell off a crate in the spring and nobody came back for it.' }
        ],
        gift: 'energyring', gold: 900
      },
      ch10_west: {
        lines: [
          { who: 'Villager', text: 'We are the next one on their list, my lady. We know. Take the whip \u2014 my son rode wyverns for Varn until he did not.' }
        ],
        gift: 'elysianwhip', gold: 0
      },
      ch10_east: {
        lines: [
          { who: 'Steward', text: 'Everything we own is in this box and everything we own is not very much. It will buy somebody a decent sword.' }
        ],
        gold: 4000
      },
      ch11_bellringer: {
        lines: [
          { who: 'Villager', text: 'I ring the bell when they come over the ridge. I have rung it four times tonight. Take this and go back inside the walls.' }
        ],
        gift: 'physic', gold: 1200
      },
      ch12_west: {
        lines: [
          { who: 'Villager', text: 'The Marshal\u2019s men took the grain and left the armoury. I have never understood soldiers. Here.' }
        ],
        gift: 'silveraxe', gold: 1500
      },
      ch13_west: {
        lines: [
          { who: 'Villager', text: 'The army came through and took the winter store. They left the shield \u2014 too heavy to carry, they said. Take it and be quicker than they were.' }
        ],
        gift: 'dracoshield', gold: 1200
      },
      ch13_east: {
        lines: [
          { who: 'Steward', text: 'There is a road behind the ridge the marshal does not watch. It is worth more to you than coin, but take the coin as well.' }
        ],
        gold: 5000
      },
      ch14_ferry: {
        lines: [
          { who: 'Villager', text: 'I ran the ferry before they built the bridge and I have kept the old boat oiled for thirty years out of spite. Take the tome \u2014 it came off a drowned mage and it has never once been used.' }
        ],
        gift: 'luna', gold: 1500
      },
      ch15_locksmith: {
        lines: [
          { who: 'Villager', text: 'Nobody in this ward has been told there is a war on. You are being very quiet about it and I would like to help. Every lock in the outer city, one pick.' }
        ],
        gift: 'lockpick', gold: 800
      },
      ch15_archivist: {
        lines: [
          { who: 'Steward', text: 'The lady told us to open the gates if a Valehart ever came. We thought she was being poetic. Take the ring, my lady, and mind the alleys.' }
        ],
        gift: 'guidingring', gold: 2500
      },
      ch12_pass: {
        lines: [
          { who: 'Steward', text: 'Nine days to the capital by the north road, my lady, and they will know you are coming on the second. Take the seal \u2014 it opens the postern gates.' }
        ],
        gift: 'goddessicon', gold: 2000
      },
      ch8_shepherd: {
        lines: [
          { who: 'Villager', text: 'Wyverns have had four of my ewes this week. If you are going up there, take the flask \u2014 my grandfather swore by it and he outlived three wars.' }
        ],
        gift: 'elixir', gold: 800
      }
    },

    gameOver: {
      lord: 'Seren has fallen. The Valehart line ends on the Greywater road.',
      objective: 'The line did not hold.'
    }
  };

  /* story items, registered alongside the regular item table so the
     inventory, drop and convoy code can treat them identically */
  FE.EXTRA_ITEMS = {
    valesignet: { name: 'Valehart Signet', type: 'item', uses: 1, price: 0, use: 'none', key: 'valesignet', mt: 0, hit: 0, crit: 0, wt: 0, rng: [0, 0], story: true, desc: 'Your father’s seal, taken off a Caldmark brigand. Somebody gave this to him.' }
  };
  Object.keys(FE.EXTRA_ITEMS).forEach(function (k) {
    if (!FE.WEAPONS[k]) FE.WEAPONS[k] = FE.EXTRA_ITEMS[k];
  });

})(window.FE = window.FE || {});
