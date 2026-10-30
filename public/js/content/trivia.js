// Know-It-All questions. `answer` is the index of the correct choice.
export const TRIVIA = [
  // Movies & TV
  { cat: "Movies & TV", q: "Which film features the line “I’ll be back”?", choices: ["Die Hard", "The Terminator", "Rambo", "Predator"], answer: 1 },
  { cat: "Movies & TV", q: "In Friends, what is the name of Ross’s monkey?", choices: ["Marcel", "Bubbles", "Coco", "George"], answer: 0 },
  { cat: "Movies & TV", q: "Which movie won the first Academy Award for Best Animated Feature?", choices: ["Toy Story", "Finding Nemo", "Shrek", "Spirited Away"], answer: 2 },
  { cat: "Movies & TV", q: "What colour pill does Neo take in The Matrix?", choices: ["Blue", "Red", "Green", "White"], answer: 1 },
  { cat: "Movies & TV", q: "Which series is set in the town of Hawkins, Indiana?", choices: ["Dark", "Stranger Things", "Twin Peaks", "Riverdale"], answer: 1 },
  { cat: "Movies & TV", q: "Who directed Jaws and E.T.?", choices: ["George Lucas", "James Cameron", "Steven Spielberg", "Ridley Scott"], answer: 2 },

  // Music
  { cat: "Music", q: "Which band released the album “Abbey Road”?", choices: ["The Rolling Stones", "The Beatles", "Queen", "The Who"], answer: 1 },
  { cat: "Music", q: "How many strings does a standard violin have?", choices: ["3", "4", "5", "6"], answer: 1 },
  { cat: "Music", q: "Which singer is known as the “Queen of Pop”?", choices: ["Madonna", "Beyoncé", "Lady Gaga", "Britney Spears"], answer: 0 },
  { cat: "Music", q: "Which Swedish group won Eurovision in 1974 with “Waterloo”?", choices: ["Roxette", "ABBA", "Ace of Base", "Europe"], answer: 1 },
  { cat: "Music", q: "What was Freddie Mercury’s band called?", choices: ["Queen", "Kiss", "Genesis", "Journey"], answer: 0 },
  { cat: "Music", q: "Which instrument has 88 keys?", choices: ["Organ", "Accordion", "Piano", "Harpsichord"], answer: 2 },

  // Geography
  { cat: "Geography", q: "What is the capital of Australia?", choices: ["Sydney", "Melbourne", "Canberra", "Perth"], answer: 2 },
  { cat: "Geography", q: "Which is the longest river in the world?", choices: ["Amazon", "Nile", "Yangtze", "Mississippi"], answer: 1 },
  { cat: "Geography", q: "Which country has the most people?", choices: ["China", "USA", "India", "Indonesia"], answer: 2 },
  { cat: "Geography", q: "On which continent is the Sahara Desert?", choices: ["Asia", "Africa", "Australia", "South America"], answer: 1 },
  { cat: "Geography", q: "Which country is shaped like a boot?", choices: ["Greece", "Portugal", "Italy", "Croatia"], answer: 2 },
  { cat: "Geography", q: "What is the smallest country in the world?", choices: ["Monaco", "Vatican City", "San Marino", "Liechtenstein"], answer: 1 },

  // Science
  { cat: "Science", q: "What gas do plants absorb from the air?", choices: ["Oxygen", "Nitrogen", "Carbon dioxide", "Helium"], answer: 2 },
  { cat: "Science", q: "How many bones are in the adult human body?", choices: ["186", "206", "226", "246"], answer: 1 },
  { cat: "Science", q: "What is the chemical symbol for gold?", choices: ["Go", "Gd", "Au", "Ag"], answer: 2 },
  { cat: "Science", q: "Which planet is closest to the Sun?", choices: ["Venus", "Mercury", "Mars", "Earth"], answer: 1 },
  { cat: "Science", q: "At what temperature does water boil at sea level?", choices: ["90 °C", "100 °C", "110 °C", "120 °C"], answer: 1 },
  { cat: "Science", q: "Which planet has the most moons?", choices: ["Jupiter", "Saturn", "Uranus", "Neptune"], answer: 1 },

  // Food & Drink
  { cat: "Food & Drink", q: "Which country does feta cheese come from?", choices: ["Italy", "Turkey", "Greece", "Spain"], answer: 2 },
  { cat: "Food & Drink", q: "What is the main ingredient of guacamole?", choices: ["Peas", "Avocado", "Cucumber", "Lime"], answer: 1 },
  { cat: "Food & Drink", q: "Which spirit is used in a classic mojito?", choices: ["Vodka", "Gin", "Tequila", "Rum"], answer: 3 },
  { cat: "Food & Drink", q: "What is sushi traditionally wrapped in?", choices: ["Rice paper", "Seaweed", "Lettuce", "Banana leaf"], answer: 1 },
  { cat: "Food & Drink", q: "Which fruit is used to make a piña colada?", choices: ["Mango", "Pineapple", "Papaya", "Passion fruit"], answer: 1 },
  { cat: "Food & Drink", q: "What does “al dente” mean for pasta?", choices: ["With sauce", "Firm to the bite", "Very soft", "Served cold"], answer: 1 },

  // Sports
  { cat: "Sports", q: "How many players are on a football (soccer) team on the pitch?", choices: ["9", "10", "11", "12"], answer: 2 },
  { cat: "Sports", q: "Which country hosted the 2016 Summer Olympics?", choices: ["China", "UK", "Brazil", "Japan"], answer: 2 },
  { cat: "Sports", q: "In tennis, what is a score of zero called?", choices: ["Nil", "Love", "Zero", "Duck"], answer: 1 },
  { cat: "Sports", q: "How long is a marathon (rounded)?", choices: ["26 km", "36 km", "42 km", "50 km"], answer: 2 },
  { cat: "Sports", q: "Which sport uses a shuttlecock?", choices: ["Squash", "Badminton", "Table tennis", "Padel"], answer: 1 },
  { cat: "Sports", q: "How many rings are on the Olympic flag?", choices: ["4", "5", "6", "7"], answer: 1 },

  // History
  { cat: "History", q: "In which year did the Berlin Wall fall?", choices: ["1985", "1989", "1991", "1993"], answer: 1 },
  { cat: "History", q: "Who was the first person to walk on the Moon?", choices: ["Buzz Aldrin", "Yuri Gagarin", "Neil Armstrong", "Michael Collins"], answer: 2 },
  { cat: "History", q: "Which ship sank on its maiden voyage in 1912?", choices: ["Lusitania", "Titanic", "Britannic", "Olympic"], answer: 1 },
  { cat: "History", q: "Which ancient wonder stood in Egypt and still exists today?", choices: ["Colossus of Rhodes", "Great Pyramid of Giza", "Lighthouse of Alexandria", "Hanging Gardens"], answer: 1 },
  { cat: "History", q: "Who painted the Mona Lisa?", choices: ["Michelangelo", "Raphael", "Leonardo da Vinci", "Rembrandt"], answer: 2 },
  { cat: "History", q: "Which empire built Machu Picchu?", choices: ["Aztec", "Maya", "Inca", "Olmec"], answer: 2 },

  // Animals
  { cat: "Animals", q: "What is a group of crows called?", choices: ["A flock", "A murder", "A parliament", "A gang"], answer: 1 },
  { cat: "Animals", q: "Which animal is the largest on Earth?", choices: ["African elephant", "Blue whale", "Giraffe", "Whale shark"], answer: 1 },
  { cat: "Animals", q: "How many legs does a spider have?", choices: ["6", "8", "10", "12"], answer: 1 },
  { cat: "Animals", q: "What is a baby kangaroo called?", choices: ["Cub", "Joey", "Kit", "Pup"], answer: 1 },
  { cat: "Animals", q: "Which bird is known for copying human speech?", choices: ["Parrot", "Pigeon", "Owl", "Flamingo"], answer: 0 },
  { cat: "Animals", q: "What do pandas mostly eat?", choices: ["Fish", "Bamboo", "Berries", "Insects"], answer: 1 },

  // Tech & Internet
  { cat: "Tech", q: "What does “www” stand for?", choices: ["World Wide Web", "Wide World Web", "Web World Wide", "World Web Wire"], answer: 0 },
  { cat: "Tech", q: "Which company makes the iPhone?", choices: ["Samsung", "Google", "Apple", "Nokia"], answer: 2 },
  { cat: "Tech", q: "Which web browser dominated the mid-1990s?", choices: ["Internet Explorer", "Netscape Navigator", "Firefox", "Opera"], answer: 1 },
  { cat: "Tech", q: "Which social network is known for its blue bird logo (before it became X)?", choices: ["Facebook", "Twitter", "Bluesky", "Tumblr"], answer: 1 },
  { cat: "Tech", q: "In computing, what does “CPU” stand for?", choices: ["Central Processing Unit", "Computer Power Unit", "Core Program Utility", "Central Program Unit"], answer: 0 },
  { cat: "Tech", q: "Which video game features a plumber named Mario?", choices: ["Sonic", "Super Mario Bros.", "Zelda", "Pac-Man"], answer: 1 },
];
