let deck = [];
let players = [];
let currentPlayer = 0;
let gameState = 'title'; // title, init, playing, end
let gameMessage = '';

let animations = [];
let isAnimating = false;
let titleButtons = [];
let showingRules = false;

let gameRanking = []; // 存储玩家完成顺序

// 新增全局变量：用于人类抽牌时的“抽牌区”
let drawPool = []; // 数组中每个元素保存 { card, origX, origY, currentX, currentY, targetX, targetY, hoverOffset }
let drawPoolActive = false;

class Card {
  constructor(suit, number) {
    this.suit = suit;
    this.number = number;
    this.width = 70;
    this.height = 100;
  }
}

class Player {
  constructor(isHuman = false) {
    this.cards = [];
    this.isHuman = isHuman;
  }
  
  // 查找手牌中互不重叠的对子
  findAllPairs() {
    let pairs = [];
    let checked = new Set();
    for (let i = 0; i < this.cards.length; i++) {
      if (checked.has(i)) continue;
      for (let j = i + 1; j < this.cards.length; j++) {
        if (this.cards[i].number === this.cards[j].number) {
          pairs.push([i, j]);
          checked.add(i);
          checked.add(j);
          break;
        }
      }
    }
    return pairs;
  }
}

class CardAnimation {
  constructor(card, startX, startY, endX, endY, duration, onComplete) {
    this.card = card;
    this.startX = startX;
    this.startY = startY;
    this.endX = endX;
    this.endY = endY;
    this.duration = duration;
    this.startTime = millis();
    this.onComplete = onComplete;
    this.rotation = 0;
    this.scale = 1;
  }
  
  update() {
    let currentTime = millis();
    let elapsed = currentTime - this.startTime;
    let progress = min(elapsed / this.duration, 1);
    progress = this.easeInOutQuad(progress);
    this.currentX = lerp(this.startX, this.endX, progress);
    this.currentY = lerp(this.startY, this.endY, progress);
    this.rotation = sin(progress * PI * 2) * PI / 16;
    this.scale = 1 + sin(progress * PI) * 0.2;
    return progress >= 1;
  }
  
  easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }
  
  display() {
    push();
    translate(this.currentX, this.currentY);
    rotate(this.rotation);
    scale(this.scale);
    displayCard(this.card, 0, 0, true);
    pop();
  }
}

class Button {
  constructor(x, y, width, height, text, onClick) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.text = text;
    this.onClick = onClick;
    this.isHovered = false;
  }
  
  display() {
    push();
    fill(this.isHovered ? 200 : 255, this.isHovered ? 200 : 255, 255);
    stroke(0);
    strokeWeight(2);
    rect(this.x, this.y, this.width, this.height, 10);
    fill(0);
    noStroke();
    textSize(20);
    textAlign(CENTER, CENTER);
    text(this.text, this.x + this.width / 2, this.y + this.height / 2);
    pop();
  }
  
  checkHover(mx, my) {
    this.isHovered = mx > this.x && mx < this.x + this.width &&
                     my > this.y && my < this.y + this.height;
    return this.isHovered;
  }
  
  checkClick(mx, my) {
    if (this.checkHover(mx, my)) {
      this.onClick();
      return true;
    }
    return false;
  }
}

function setup() {
  createCanvas(800, 600);
  titleButtons = [
    new Button(width / 2 - 100, height / 2 - 40, 200, 50, '开始游戏', () => {
      gameState = 'init';
      initGame();
      startTurn();
    }),
    new Button(width / 2 - 100, height / 2 + 40, 200, 50, '游戏说明', () => {
      showingRules = !showingRules;
    })
  ];
}

function initGame() {
  // 创建52张牌 + 1张鬼牌（number 为 0，不参与配对）
  const suits = ['♠', '♥', '♦', '♣'];
  deck = [];
  for (let suit of suits) {
    for (let i = 1; i <= 13; i++) {
      deck.push(new Card(suit, i));
    }
  }
  deck.push(new Card('Joker', 0));
  
  // 洗牌
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  
  // 创建玩家：0 为人类（底部）、1 为左侧、2 为顶部、3 为右侧
  players = [
    new Player(true),
    new Player(),
    new Player(),
    new Player()
  ];
  
  // 发牌（轮流发牌）
  let cardIndex = 0;
  while (cardIndex < deck.length) {
    for (let p of players) {
      if (cardIndex < deck.length) {
        p.cards.push(deck[cardIndex]);
        cardIndex++;
      }
    }
  }
  
  // 发牌后自动移除各玩家的对子（鬼牌不配对）
  removeInitialPairs();
  checkGameEnd();
  gameState = 'playing';
}

function removeInitialPairs() {
  for (let p = 0; p < players.length; p++) {
    let pairs = players[p].findAllPairs();
    if (pairs.length > 0) {
      let indicesToRemove = [];
      for (let pair of pairs) {
        indicesToRemove.push(pair[0], pair[1]);
      }
      indicesToRemove.sort((a, b) => b - a);
      for (let idx of indicesToRemove) {
        players[p].cards.splice(idx, 1);
      }
    }
    if (players[p].cards.length === 0 && !gameRanking.includes(p)) {
      gameRanking.push(p);
    }
  }
}

function draw() {
  background(34, 139, 34);
  
  switch (gameState) {
    case 'title':
      drawTitleScreen();
      break;
    case 'init':
    case 'playing':
      // 更新并显示动画
      if (animations.length > 0) {
        isAnimating = true;
        let completed = [];
        for (let i = animations.length - 1; i >= 0; i--) {
          let anim = animations[i];
          if (anim.update()) {
            completed.push(i);
            if (anim.onComplete) anim.onComplete();
          } else {
            anim.display();
          }
        }
        for (let i of completed) {
          animations.splice(i, 1);
        }
        if (animations.length === 0) {
          isAnimating = false;
        }
      }
      
      // 显示游戏界面
      displayGame();
      displayMessage();
      
      // 如果人类抽牌区处于激活状态，则更新并绘制 drawPool 内的牌
      if (drawPoolActive) {
        let currentTime = millis();
        let duration = drawPool.animDuration || 1000;
        let progress = min((currentTime - drawPool.startTime) / duration, 1);
        for (let obj of drawPool) {
          obj.currentX = lerp(obj.origX, obj.targetX, progress);
          obj.currentY = lerp(obj.origY, obj.targetY, progress);
          // 如果鼠标悬停在牌上，则该牌向上浮动
          if (mouseX >= obj.currentX && mouseX <= obj.currentX + 70 &&
              mouseY >= obj.currentY && mouseY <= obj.currentY + 100) {
            obj.hoverOffset = lerp(obj.hoverOffset, -20, 0.2);
          } else {
            obj.hoverOffset = lerp(obj.hoverOffset, 0, 0.2);
          }
          // 绘制抽牌区内的牌（显示牌面）
          displayCard(obj.card, obj.currentX, obj.currentY + obj.hoverOffset, false);
        }
      }
      
      // 显示当前玩家提示
      textSize(24);
      fill(255);
      textAlign(CENTER, TOP);
      let cpText = (currentPlayer === 0 ? '你' : 'AI-' + currentPlayer);
      text('当前玩家: ' + cpText, width / 2, 20);
      break;
    case 'end':
      displayGame();
      displayMessage();
      push();
      fill(255);
      stroke(0);
      strokeWeight(2);
      rect(width / 2 - 100, height - 100, 200, 50, 10);
      fill(0);
      noStroke();
      textSize(20);
      textAlign(CENTER, CENTER);
      text('返回主菜单', width / 2, height - 75);
      pop();
      break;
  }
}

function displayGame() {
  // 显示人类玩家手牌（底部）
  if (players[0].isHuman) {
    let startX = width / 2 - (players[0].cards.length * 30);
    for (let i = 0; i < players[0].cards.length; i++) {
      displayCard(players[0].cards[i], startX + i * 30, height - 150, true);
    }
  }
  
  // 显示左侧 AI 玩家手牌
  let leftStartY = height / 2 - (players[1].cards.length * 15);
  for (let i = 0; i < players[1].cards.length; i++) {
    displayCardBack(50, leftStartY + i * 30, 90);
  }
  
  // 显示顶部 AI 玩家手牌
  let topStartX = width / 2 - (players[2].cards.length * 15);
  for (let i = 0; i < players[2].cards.length; i++) {
    displayCardBack(topStartX + i * 30, 50, 0);
  }
  
  // 若抽牌区未激活，则显示右侧玩家手牌（玩家 3）的牌
  if (!drawPoolActive) {
    let rightStartY = height / 2 - (players[3].cards.length * 15);
    for (let i = 0; i < players[3].cards.length; i++) {
      displayCardBack(width - 120, rightStartY + i * 30, -90);
    }
  }
}

function displayCard(card, x, y, isVisible = false) {
  push();
  translate(x, y);
  fill(255);
  stroke(0);
  strokeWeight(2);
  rect(0, 0, 70, 100, 8);
  
  if (isVisible) {
    if (card.suit === 'Joker') {
      fill(0);
      textSize(16);
      textAlign(CENTER, CENTER);
      text('JOKER', 35, 30);
      fill(255, 0, 0);
      ellipse(35, 60, 20, 20);
      fill(0);
      arc(35, 60, 15, 15, 0, PI);
    } else {
      fill(card.suit === '♥' || card.suit === '♦' ? 'red' : 'black');
      textSize(20);
      textAlign(CENTER, CENTER);
      text(card.suit, 15, 20);
      textSize(16);
      text(getCardNumberDisplay(card.number), 15, 40);
      push();
      translate(70, 100);
      rotate(PI);
      textSize(20);
      text(card.suit, 15, 20);
      textSize(16);
      text(getCardNumberDisplay(card.number), 15, 40);
      pop();
    }
  } else {
    fill(200, 0, 0);
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 7; j++) {
        ellipse(10 + i * 15, 10 + j * 15, 5, 5);
      }
    }
  }
  pop();
}

function displayCardBack(x, y, rotation) {
  push();
  translate(x, y);
  rotate(rotation * PI / 180);
  fill(200, 0, 0);
  stroke(0);
  strokeWeight(2);
  rect(0, 0, 70, 100, 8);
  fill(150, 0, 0);
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 7; j++) {
      ellipse(10 + i * 15, 10 + j * 15, 5, 5);
    }
  }
  pop();
}

function getCardNumberDisplay(number) {
  switch (number) {
    case 1: return 'A';
    case 11: return 'J';
    case 12: return 'Q';
    case 13: return 'K';
    default: return number.toString();
  }
}

function displayMessage() {
  textSize(20);
  fill(255);
  textAlign(CENTER, CENTER);
  let lines = gameMessage.split('\n');
  let y = height / 2 - (lines.length - 1) * 15;
  for (let line of lines) {
    text(line, width / 2, y);
    y += 30;
  }
  
  if (gameState === 'playing' && gameRanking.length > 0) {
    textSize(16);
    textAlign(LEFT, TOP);
    text('当前完成顺序：', 10, 10);
    for (let i = 0; i < gameRanking.length; i++) {
      let playerIndex = gameRanking[i];
      text((i + 1) + '. ' + (playerIndex === 0 ? '你' : 'AI-' + playerIndex), 10, 35 + i * 25);
    }
  }
}

function drawTitleScreen() {
  push();
  textSize(48);
  fill(255);
  textAlign(CENTER, CENTER);
  text('抽鬼牌', width / 2, height / 4);
  
  for (let btn of titleButtons) {
    btn.display();
  }
  
  if (showingRules) {
    drawRules();
  }
  pop();
}

function drawRules() {
  push();
  fill(255, 255, 255, 240);
  stroke(0);
  strokeWeight(2);
  rect(100, 100, width - 200, height - 200, 20);
  fill(0);
  noStroke();
  textSize(24);
  textAlign(CENTER, TOP);
  text('游戏规则说明', width / 2, 120);
  textSize(16);
  textAlign(LEFT, TOP);
  let rules = [
    '1. 游戏开始时，52张扑克牌和1张鬼牌平均发给4位玩家，发牌后自动移除手中的对子（鬼牌不配对）。',
    '2. 每回合玩家只能从上家（前一位玩家）抽牌。',
    '3. 轮到你时，上家的牌会移动到你上方，鼠标经过的牌会向上浮动，点击选择要抽的牌。',
    '4. 抽牌后若形成对子会自动移除，先清完牌者获胜，最后剩鬼牌者为输家。',
    '',
    '操作说明：',
    '- 人类玩家点击抽牌区中的牌进行抽牌。',
    '- AI 玩家自动从上家抽牌。',
    '',
    '目标：尽快清空手牌，避免最后留下鬼牌！'
  ];
  let y = 160;
  for (let rule of rules) {
    text(rule, 120, y);
    y += 25;
  }
  pop();
}

function mouseMoved() {
  if (gameState === 'title') {
    for (let btn of titleButtons) {
      btn.checkHover(mouseX, mouseY);
    }
  }
}

function mousePressed() {
  if (gameState === 'title') {
    for (let btn of titleButtons) {
      if (btn.checkClick(mouseX, mouseY)) return;
    }
  } else if (gameState === 'end') {
    if (mouseX >= width / 2 - 100 && mouseX <= width / 2 + 100 &&
        mouseY >= height - 100 && mouseY <= height - 50) {
      gameState = 'title';
      showingRules = false;
    }
  } else if (gameState === 'playing') {
    // 当轮到你（玩家 0）且抽牌区激活时，只允许点击抽牌区中的牌
    if (currentPlayer === 0 && players[0].isHuman && drawPoolActive) {
      for (let i = 0; i < drawPool.length; i++) {
        let obj = drawPool[i];
        if (mouseX >= obj.currentX && mouseX <= obj.currentX + 70 &&
            mouseY >= obj.currentY + obj.hoverOffset && mouseY <= obj.currentY + obj.hoverOffset + 100) {
          handleHumanDrawSelection(i);
          return;
        }
      }
    }
  }
}

// 当人类玩家点击抽牌区中的一张牌时调用
function handleHumanDrawSelection(selectedIndex) {
  drawPoolActive = false;
  let selectedObj = drawPool[selectedIndex];
  let humanPlayer = players[0];
  let destX = width / 2 - (humanPlayer.cards.length * 30);
  let destY = height - 150;
  animations.push(new CardAnimation(
    selectedObj.card,
    selectedObj.currentX,
    selectedObj.currentY + selectedObj.hoverOffset,
    destX,
    destY,
    1000,
    () => {
      humanPlayer.cards.push(selectedObj.card);
      setTimeout(() => {
        autoRemovePairsForPlayer(0, () => {
          returnRemainingDrawPool();
        });
      }, 500);
    }
  ));
  drawPool.splice(selectedIndex, 1);
}

// 将抽牌区中剩余的牌动画返回到上家的手牌区
function returnRemainingDrawPool() {
  // 对于人类玩家，上家为玩家 3
  let prevIndex = 0 === 0 ? 3 : 0 - 1;
  let remainingCount = drawPool.length;
  let rightStartY = height / 2 - (remainingCount * 15);
  for (let i = 0; i < remainingCount; i++) {
    let destX = width - 120;
    let destY = rightStartY + i * 30;
    let obj = drawPool[i];
    animations.push(new CardAnimation(
      obj.card,
      obj.currentX,
      obj.currentY + obj.hoverOffset,
      destX,
      destY,
      1000,
      () => {
        players[prevIndex].cards.push(obj.card);
      }
    ));
  }
  drawPool = [];
  setTimeout(() => {
    currentPlayer = (currentPlayer + 1) % 4;
    startTurn();
  }, 1500);
}

// AI 玩家抽牌：改为只从自己的上家抽牌
function drawCardAsAI(aiIndex) {
  let prevIndex = aiIndex === 0 ? 3 : aiIndex - 1;
  let targetPlayer = players[prevIndex];
  if (targetPlayer.cards.length > 0 && !isAnimating) {
    let randomIndex = Math.floor(Math.random() * targetPlayer.cards.length);
    let drawnCard = targetPlayer.cards[randomIndex];
    let startX, startY, endX, endY;
    // 根据上家位置确定起始坐标
    if (prevIndex === 0) { // 人类玩家（底部）
      startX = width / 2;
      startY = height - 150;
    } else if (prevIndex === 1) { // 左侧玩家
      startX = 50;
      startY = height / 2;
    } else if (prevIndex === 2) { // 顶部玩家
      startX = width / 2;
      startY = 50;
    } else if (prevIndex === 3) { // 右侧玩家
      startX = width - 120;
      let count = targetPlayer.cards.length;
      let rightStartY = height / 2 - (count * 15);
      startY = rightStartY + randomIndex * 30;
    }
    // 目的地：根据 AI 所处位置确定
    if (aiIndex === 0) {
      endX = width / 2 - (players[0].cards.length * 30);
      endY = height - 150;
    } else if (aiIndex === 1) {
      endX = 50;
      endY = height / 2;
    } else if (aiIndex === 2) {
      endX = width / 2;
      endY = 50;
    } else if (aiIndex === 3) {
      endX = width - 120;
      endY = height / 2;
    }
    animations.push(new CardAnimation(
      drawnCard,
      startX,
      startY,
      endX,
      endY,
      1000,
      () => {
        targetPlayer.cards.splice(randomIndex, 1);
        players[aiIndex].cards.push(drawnCard);
        gameMessage = 'AI-' + aiIndex + ' 从玩家-' + prevIndex + ' 抽了一张牌';
        setTimeout(() => {
          autoRemovePairsForPlayer(aiIndex, () => {
            currentPlayer = (currentPlayer + 1) % 4;
            startTurn();
          });
        }, 500);
      }
    ));
  }
}

function autoRemovePairsForPlayer(playerIndex, callback) {
  let pairs = players[playerIndex].findAllPairs();
  if (pairs.length > 0 && !isAnimating) {
    let pair = pairs[0];
    let cardNum = players[playerIndex].cards[pair[0]].number;
    let startX1, startX2, startY;
    if (playerIndex === 0) {
      startX1 = width / 2 - (players[0].cards.length * 30) + pair[0] * 30;
      startX2 = width / 2 - (players[0].cards.length * 30) + pair[1] * 30;
      startY = height - 150;
    } else if (playerIndex === 1) {
      startX1 = 50;
      startX2 = 50;
      startY = height / 2 - (players[1].cards.length * 15) + pair[0] * 30;
    } else if (playerIndex === 2) {
      startX1 = width / 2 - (players[2].cards.length * 15) + pair[0] * 30;
      startX2 = width / 2 - (players[2].cards.length * 15) + pair[1] * 30;
      startY = 50;
    } else if (playerIndex === 3) {
      startX1 = width - 120;
      startX2 = width - 120;
      startY = height / 2 - (players[3].cards.length * 15) + pair[0] * 30;
    }
    animations.push(new CardAnimation(
      players[playerIndex].cards[pair[0]],
      startX1,
      startY,
      width / 2 - 40,
      height / 2,
      800,
      null
    ));
    animations.push(new CardAnimation(
      players[playerIndex].cards[pair[1]],
      startX2,
      startY,
      width / 2 + 40,
      height / 2,
      800,
      () => {
        let first = Math.max(pair[0], pair[1]);
        let second = Math.min(pair[0], pair[1]);
        players[playerIndex].cards.splice(first, 1);
        players[playerIndex].cards.splice(second, 1);
        gameMessage = (playerIndex === 0 ? '你' : 'AI-' + playerIndex) + ' 自动移除了一对 ' + getCardNumberDisplay(cardNum);
        setTimeout(() => {
          autoRemovePairsForPlayer(playerIndex, callback);
        }, 900);
      }
    ));
  } else {
    if (callback) callback();
  }
}

function startTurn() {
  // 如果当前玩家手牌已清空，则直接进入下一位
  if (players[currentPlayer].cards.length === 0) {
    checkGameEnd();
    if (gameState !== 'end') {
      currentPlayer = (currentPlayer + 1) % 4;
      startTurn();
    }
    return;
  }
  
  if (currentPlayer === 0) {
    // 人类玩家回合：设置抽牌区，目标为上家（玩家 3）的牌
    let prevIndex = 0 === 0 ? 3 : 0 - 1;
    let prevPlayer = players[prevIndex];
    drawPool = [];
    let m = prevPlayer.cards.length;
    if (m === 0) {
      // 如果上家没有牌，则直接跳过
      currentPlayer = (currentPlayer + 1) % 4;
      startTurn();
      return;
    }
    let spacing = 80;
    let startX_pool = width / 2 - ((m - 1) * spacing) / 2;
    let targetY = height - 250; // 抽牌区的 Y 坐标
    // 根据右侧玩家（玩家 3）的显示逻辑计算原始位置
    let rightStartY = height / 2 - (m * 15);
    for (let i = 0; i < m; i++) {
      let card = prevPlayer.cards[i];
      let origX = width - 120;
      let origY = rightStartY + i * 30;
      let targetX = startX_pool + i * spacing;
      drawPool.push({
        card: card,
        origX: origX,
        origY: origY,
        currentX: origX,
        currentY: origY,
        targetX: targetX,
        targetY: targetY,
        hoverOffset: 0
      });
    }
    // 将上家的牌临时移入抽牌区
    prevPlayer.cards = [];
    drawPool.startTime = millis();
    drawPool.animDuration = 1000;
    drawPoolActive = true;
    gameMessage = '请选择要抽的牌';
  } else {
    // AI 回合：自动从上家抽牌
    gameMessage = 'AI-' + currentPlayer + ' 正在思考……';
    setTimeout(() => {
      drawCardAsAI(currentPlayer);
    }, 1000);
  }
}

function checkGameEnd() {
  for (let i = 0; i < players.length; i++) {
    if (players[i].cards.length === 0 && !gameRanking.includes(i)) {
      gameRanking.push(i);
    }
  }
  
  let activePlayers = players.filter(p => p.cards.length > 0);
  if (activePlayers.length === 1) {
    let lastPlayer = activePlayers[0];
    let lastPlayerIndex = players.indexOf(lastPlayer);
    if (!gameRanking.includes(lastPlayerIndex)) {
      gameRanking.push(lastPlayerIndex);
    }
    gameState = 'end';
    if (lastPlayer.isHuman) {
      gameMessage = '游戏结束！\n你是最后一名……\n点击“返回主菜单”重新开始';
    } else {
      let playerRank = gameRanking.indexOf(0) + 1;
      if (playerRank === 1) {
        gameMessage = '恭喜你获得胜利！\n你是第一名！\n点击“返回主菜单”重新开始';
      } else {
        gameMessage = '游戏结束！\n你获得第' + playerRank + '名\nAI-' + lastPlayerIndex + ' 是最后一名\n点击“返回主菜单”重新开始';
      }
    }
  } else if (gameRanking.includes(0)) {
    let playerRank = gameRanking.indexOf(0) + 1;
    gameMessage = '你已完成游戏！\n当前排名第' + playerRank + '名\n等待其他玩家……';
  }
}
