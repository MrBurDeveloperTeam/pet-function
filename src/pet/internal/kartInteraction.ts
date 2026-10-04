export const KART_GAME_ID = 'karting';

// East end of the sand path, between the plaza lamp and the circuit gate lamp.
// Positions use the same normalized coordinates as outdoorNavigation.
export const KART_ENTRANCE = { x: 0.405, y: 0.49 };

export function isNearKartEntrance(x: number, y: number, width: number, height: number) {
  if (width <= 0 || height <= 0) return false;
  const normalizedX = x / width;
  const normalizedY = y / height;
  return normalizedX >= 0.382 && normalizedX <= 0.425
    && normalizedY >= 0.455 && normalizedY <= 0.525;
}

// Asphalt boundary plus the two garden islands. Even-odd filling keeps the
// islands out of the click target and traces both sides of the circuit.
export const KART_CIRCUIT_OUTLINE = `
  M 819 527 C 793 503 789 472 794 442 C 805 364 886 322 1032 304
  C 1184 285 1435 294 1553 288 C 1685 288 1780 326 1810 401
  C 1841 477 1827 568 1793 620 C 1754 679 1647 700 1515 728
  C 1395 757 1298 784 1163 786 L 834 776 C 681 766 584 721 554 662
  C 535 625 539 582 568 556 C 608 522 689 523 819 527 Z
  M 976 407 C 1063 390 1207 400 1348 384 C 1432 375 1475 359 1523 375
  C 1600 392 1650 431 1645 482 C 1642 539 1608 581 1541 582
  C 1465 587 1417 557 1378 529 C 1335 499 1299 486 1234 484
  L 1004 494 C 961 497 935 484 934 460 C 930 436 946 418 976 407 Z
  M 761 602 C 830 584 931 588 991 567 C 1028 555 1047 549 1091 555
  C 1148 562 1251 549 1283 592 C 1321 643 1294 674 1232 684
  C 1123 700 945 695 835 689 C 758 684 712 669 709 640
  C 705 622 724 609 761 602 Z
`;
